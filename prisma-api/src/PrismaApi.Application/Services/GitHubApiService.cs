using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using PrismaApi.Application.Interfaces.Services;
using PrismaApi.Domain.Dtos;
using PrismaApi.Infrastructure.Caching;

namespace PrismaApi.Application.Services;

public class GitHubApiService : IGitHubApiService
{
    private const string InstallationTokenCacheKey = "GitHubApiInstallationToken";
    private const string Owner = "equinor";
    private const string Repository = "prisma-decision";
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly IMemoryCache _memoryCache;
    private readonly IPrismaDecisionAiApiService _aiApi;

    public GitHubApiService(
        HttpClient httpClient,
        IConfiguration configuration,
        IMemoryCache memoryCache,
        IPrismaDecisionAiApiService aiApi)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _memoryCache = memoryCache;
        _aiApi = aiApi;
    }

    public async Task<List<GitHubIssueOutgoingDto>> GetOpenIssuesAsync(CancellationToken ct = default)
    {
        const int pageSize = 100;
        var installationToken = await GetInstallationTokenAsync(ct);
        var issues = new List<GitHubIssueOutgoingDto>();

        for (var page = 1; ; page++)
        {
            using var request = CreateRequest(HttpMethod.Get,
                $"repos/{Owner}/{Repository}/issues?state=open&per_page={pageSize}&page={page}");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", installationToken);

            using var response = await _httpClient.SendAsync(request, ct);
            response.EnsureSuccessStatusCode();

            using var content = await response.Content.ReadAsStreamAsync(ct);
            using var document = await JsonDocument.ParseAsync(content, cancellationToken: ct);
            foreach (var issue in document.RootElement.EnumerateArray())
            {
                if (issue.TryGetProperty("pull_request", out _))
                {
                    continue;
                }
                // how the issue types 

                issues.Add(new GitHubIssueOutgoingDto
                {
                    IssueNumber = issue.GetProperty("number").GetInt32(),
                    Feedback = issue.GetProperty("body").GetString()
                        ?? string.Empty,
                    IssueUrl = issue.GetProperty("html_url").GetString()
                        ?? string.Empty,
                    // get the issue types
                    Type = issue.TryGetProperty("type", out var typeElement) &&
                            typeElement.ValueKind == JsonValueKind.Object &&
                            typeElement.TryGetProperty("name", out var nameElement) &&
                            nameElement.GetString() is string typeName
                                ? typeName
                                : string.Empty
                });
            }

            if (document.RootElement.GetArrayLength() < pageSize)
            {
                return issues;
            }
        }
    }

    public async Task<GitHubIssueDuplicateCheckResultDto?> CheckIssueDuplicatesAsync(
        GitHubIssueIncomingDto dto, CancellationToken ct = default)
    {
        var existingIssues = await GetOpenIssuesAsync(ct);
        return await _aiApi.CheckIssueDuplicatesAsync(dto, existingIssues, ct);
    }

    public async Task<GitHubIssueOutgoingDto> CreateIssueAsync(GitHubIssueIncomingDto dto, CancellationToken ct = default)
    {
        var installationToken = await GetInstallationTokenAsync(ct);
        var duplicateCheckResult = await CheckIssueDuplicatesAsync(dto, ct);
        var duplicateIssueNumbers = duplicateCheckResult?.Duplicates
            .Select(duplicate => duplicate.IssueNumber)
            .Where(issueNumber => issueNumber > 0)
            .ToArray() ?? [];

        using var request = CreateRequest(HttpMethod.Post, $"repos/{Owner}/{Repository}/issues");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", installationToken);

        request.Content = JsonContent.Create(new
        {
            title = duplicateCheckResult?.Title,
            body = duplicateIssueNumbers.Length > 0
                ? $"Duplicate of {string.Join(", ", duplicateIssueNumbers.Select(issueNumber => $"#{issueNumber}"))}\n\n{dto.Feedback}"
                : dto.Feedback,
            label = duplicateIssueNumbers.Length > 0 ? "duplicate" : string.Empty,
            type = dto.Type
        });

        using var response = await _httpClient.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        using var content = await response.Content.ReadAsStreamAsync(ct);
        using var document = await JsonDocument.ParseAsync(content, cancellationToken: ct);
        return new GitHubIssueOutgoingDto
        {
            IssueNumber = document.RootElement.GetProperty("number").GetInt32(),
            Feedback = document.RootElement.GetProperty("body").GetString() ?? string.Empty,
            Type = dto.Type,
            IssueUrl = document.RootElement.GetProperty("html_url").GetString() ?? string.Empty
        };
    }



    private async Task<string> GetInstallationTokenAsync(CancellationToken ct)
    {
        var cacheKey = CacheKeys.GetUserKey(CacheKeys.GetGitHubApiInstallationTokenKey("installation_token"));

        if (_memoryCache.TryGetValue(cacheKey, out string? cachedToken) && cachedToken != null)
        {
            return cachedToken;
        }

        var installationId = GetRequiredConfiguration("GitHubApi:InstallationId");
        using var request = CreateRequest(HttpMethod.Post, $"app/installations/{installationId}/access_tokens");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", CreateAppJwt());
        request.Content = JsonContent.Create(new { });

        using var response = await _httpClient.SendAsync(request, ct);
        var responseContent = await response.Content.ReadAsStringAsync(ct);
        response.EnsureSuccessStatusCode();

        using var document = JsonDocument.Parse(responseContent);
        var token = document.RootElement.GetProperty("token").GetString()
            ?? throw new InvalidOperationException("GitHub did not return an installation token.");
        var expiresAt = document.RootElement.GetProperty("expires_at").GetDateTimeOffset();
        _memoryCache.AddCacheItem(
            new CacheItem { CacheKey = InstallationTokenCacheKey },
            expiresAt.AddMinutes(-5) - DateTimeOffset.UtcNow,
            token);
        return token;
    }

    private string CreateAppJwt()
    {
        var appId = GetRequiredConfiguration("GitHubApi:AppId");
        string privateKey = File.ReadAllText("/Users/RKAT/Desktop/Projects/PrismaDecision/prisma-decision/prisma-github-issue-creation.2026-11-23.private-key.pem");
        var now = DateTimeOffset.UtcNow;
        var header = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(new { alg = "RS256", typ = "JWT" }));
        var payload = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(new
        {
            iat = now.AddSeconds(-60).ToUnixTimeSeconds(),
            exp = now.AddMinutes(9).ToUnixTimeSeconds(),
            iss = appId
        }));
        var unsignedToken = $"{header}.{payload}";

        using var rsa = RSA.Create();
        rsa.ImportFromPem(privateKey);
        var signature = rsa.SignData(Encoding.UTF8.GetBytes(unsignedToken), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        return $"{unsignedToken}.{Base64UrlEncode(signature)}";
    }

    private HttpRequestMessage CreateRequest(HttpMethod method, string path)
    {
        var baseUrl = _configuration["GitHubApi:BaseUrl"] ?? "https://api.github.com/";
        var request = new HttpRequestMessage(method, new Uri(new Uri(baseUrl.TrimEnd('/') + "/"), path));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
        request.Headers.UserAgent.ParseAdd("PrismaDecisionApi");
        request.Headers.Add("X-GitHub-Api-Version", "2022-11-28");
        return request;
    }

    private string GetRequiredConfiguration(string key)
        => _configuration[key] ?? throw new InvalidOperationException($"Missing required configuration: {key}");

    private static string Base64UrlEncode(byte[] value)
        => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
