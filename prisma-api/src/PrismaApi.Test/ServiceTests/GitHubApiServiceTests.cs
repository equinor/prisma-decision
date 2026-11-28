using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using PrismaApi.Api.Controllers;
using PrismaApi.Application.Interfaces.Services;
using PrismaApi.Application.Services;
using PrismaApi.Domain.Dtos;
using PrismaApi.Infrastructure.Caching;

namespace PrismaApi.Test.ServiceTests;

public class GitHubApiServiceTests
{
    private static string Body(string feedback, string sender = "Example user")
        => $"## Feedback\n\n{feedback}\n\n## Sent with your feedback\n\nPage: Issues\nFrom: {sender}";

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task CreateIssue_UsesAiDuplicateCheck_LabelsDuplicatesAndLeavesThemOpen(bool duplicate)
    {
        using var handler = new GitHubHandler(JsonSerializer.Serialize(new[]
        {
            new { number = 42, html_url = "https://github.com/example/repo/issues/42", body = Body("Existing feedback", "Another user") }
        }));
        using var client = new HttpClient(handler);
        using var cache = CreateTokenCache();
        var aiApi = new FakeAiApi
        {
            Result = new GitHubIssueDuplicateCheckResultDto
            {
                Title = "Feedback: Keep unsaved changes.",
                Duplicates = duplicate ? [new GitHubIssueDuplicateDto { IssueNumber = 42 }] : []
            }
        };
        var service = new GitHubApiService(client, new ConfigurationBuilder().Build(), cache, aiApi);
        var controller = new GitHubIssuesController(service, NullLogger<GitHubIssuesController>.Instance);
        var dto = new GitHubIssueIncomingDto { Feedback = Body("Keep unsaved changes."), Type = "Bug" };

        var result = await controller.CreateIssue(dto);

        var response = Assert.IsType<CreatedResult>(result.Result);
        var issue = Assert.IsType<GitHubIssueOutgoingDto>(response.Value);
        Assert.Equal(201, response.StatusCode);
        Assert.Equal(101, issue.IssueNumber);
        Assert.Equal("https://github.com/example/repo/issues/101", response.Location);
        Assert.Equal(response.Location, issue.IssueUrl);

        // The AI API received the new feedback plus the open issues to compare against.
        Assert.Equal(dto.Feedback, aiApi.ReceivedIssue?.Feedback);
        Assert.Equal([42], aiApi.ReceivedExisting.Select(existing => existing.IssueNumber));

        using var payload = JsonDocument.Parse(Assert.IsType<string>(handler.CreateBody));
        Assert.Equal("Feedback: Keep unsaved changes.", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(duplicate ? "Duplicate of #42\n\n" + dto.Feedback : dto.Feedback,
            payload.RootElement.GetProperty("body").GetString());
        Assert.Equal(duplicate ? new[] { "Bug", "duplicate" } : new[] { "Bug" },
            payload.RootElement.GetProperty("labels").EnumerateArray().Select(label => label.GetString()));
        Assert.Equal(new[] { HttpMethod.Get, HttpMethod.Post }, handler.Methods);
    }

    [Fact]
    public async Task GetOpenIssues_FullPullRequestPage_FetchesNextPageAndReturnsOnlyIssues()
    {
        var pullRequests = Enumerable.Range(1, 100).Select(number => new { number, pull_request = new { } });
        using var handler = new GitHubHandler(JsonSerializer.Serialize(pullRequests),
            """[{"number":101,"html_url":"https://github.com/example/repo/issues/101","body":null}]""");
        using var client = new HttpClient(handler);
        using var cache = CreateTokenCache();
        var service = new GitHubApiService(client, new ConfigurationBuilder().Build(), cache, new FakeAiApi());

        var issues = await service.GetOpenIssuesAsync();

        var issue = Assert.Single(issues);
        Assert.Equal(101, issue.IssueNumber);
        Assert.Equal("", issue.Feedback);
        Assert.Equal(new[]
        {
            "/repos/equinor/prisma-decision/issues?state=open&per_page=100&page=1",
            "/repos/equinor/prisma-decision/issues?state=open&per_page=100&page=2"
        }, handler.Paths);
    }

    [Fact]
    public async Task CreateIssue_ListingFails_DoesNotCreateOrReturnPartialResults()
    {
        var page = Enumerable.Range(1, 100).Select(number =>
            new { number, html_url = "https://github.com/example/repo/issues/" + number, body = "Details" });
        using var handler = new GitHubHandler(JsonSerializer.Serialize(page))
        {
            ListingStatus = HttpStatusCode.ServiceUnavailable
        };
        using var client = new HttpClient(handler);
        using var cache = CreateTokenCache();
        var aiApi = new FakeAiApi();
        var service = new GitHubApiService(client, new ConfigurationBuilder().Build(), cache, aiApi);

        await Assert.ThrowsAsync<HttpRequestException>(() =>
            service.CreateIssueAsync(new GitHubIssueIncomingDto { Feedback = Body("New feedback"), Type = "Bug" }));

        Assert.Equal(new[] { HttpMethod.Get, HttpMethod.Get }, handler.Methods);
        Assert.Null(handler.CreateBody);
        Assert.Null(aiApi.ReceivedIssue);
    }

    [Fact]
    public async Task InstallationToken_IsCachedUnderTheLookupKey()
    {
        using var rsa = RSA.Create(2048);
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["GitHubApi:AppId"] = "123",
            ["GitHubApi:InstallationId"] = "456",
            ["GitHubApi:PrivateKey"] = rsa.ExportRSAPrivateKeyPem()
        }).Build();
        using var handler = new GitHubHandler("[]", "[]");
        using var client = new HttpClient(handler);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new GitHubApiService(client, configuration, cache, new FakeAiApi());

        await service.GetOpenIssuesAsync();
        await service.GetOpenIssuesAsync();

        Assert.Equal(1, handler.TokenRequests);
    }

    private sealed class FakeAiApi : IPrismaDecisionAiApiService
    {
        public GitHubIssueDuplicateCheckResultDto Result { get; init; } =
            new() { Title = "Feedback", Duplicates = [] };
        public GitHubIssueIncomingDto? ReceivedIssue { get; private set; }
        public IReadOnlyCollection<GitHubIssueOutgoingDto> ReceivedExisting { get; private set; } = [];

        public Task<GitHubIssueDuplicateCheckResultDto> CheckIssueDuplicatesAsync(
            GitHubIssueIncomingDto issue,
            IReadOnlyCollection<GitHubIssueOutgoingDto> existingIssues,
            CancellationToken ct = default)
        {
            ReceivedIssue = issue;
            ReceivedExisting = existingIssues;
            return Task.FromResult(Result);
        }
    }

    private static MemoryCache CreateTokenCache()
    {
        var cache = new MemoryCache(new MemoryCacheOptions());
        cache.Set(CacheKeys.GetUserKey(CacheKeys.GetGitHubApiInstallationTokenKey("installation_token")),
            "test-installation-token");
        return cache;
    }

    private sealed class GitHubHandler(params string[] pages) : HttpMessageHandler
    {
        private readonly Queue<string> _pages = new(pages);
        public List<HttpMethod> Methods { get; } = new();
        public List<string> Paths { get; } = new();
        public string? CreateBody { get; private set; }
        public int TokenRequests { get; private set; }
        public HttpStatusCode ListingStatus { get; init; } = HttpStatusCode.OK;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            if (request.RequestUri!.AbsolutePath.EndsWith("/access_tokens"))
            {
                TokenRequests++;
                Assert.Equal("Bearer", request.Headers.Authorization?.Scheme);
                return Response(HttpStatusCode.Created, JsonSerializer.Serialize(new
                {
                    token = "test-installation-token",
                    expires_at = DateTimeOffset.UtcNow.AddHours(1)
                }));
            }
            Methods.Add(request.Method);
            Assert.Equal("test-installation-token", request.Headers.Authorization?.Parameter);
            if (request.Method == HttpMethod.Post)
            {
                Assert.Equal("/repos/equinor/prisma-decision/issues", request.RequestUri.AbsolutePath);
                CreateBody = await request.Content!.ReadAsStringAsync(ct);
                using var created = JsonDocument.Parse(CreateBody);
                var createdBody = created.RootElement.GetProperty("body").GetString();
                return Response(HttpStatusCode.Created, JsonSerializer.Serialize(new
                {
                    number = 101,
                    html_url = "https://github.com/example/repo/issues/101",
                    body = createdBody
                }));
            }
            Assert.Equal(HttpMethod.Get, request.Method);
            Paths.Add(request.RequestUri.PathAndQuery);
            return _pages.Count > 0
                ? Response(HttpStatusCode.OK, _pages.Dequeue())
                : Response(ListingStatus, "[]");
        }

        private static HttpResponseMessage Response(HttpStatusCode status, string body)
            => new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
    }
}
