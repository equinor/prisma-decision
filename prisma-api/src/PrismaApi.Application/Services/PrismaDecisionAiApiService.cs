using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Identity.Abstractions;
using PrismaApi.Application.Interfaces.Services;
using PrismaApi.Domain.Dtos;

namespace PrismaApi.Application.Services;

public sealed class PrismaDecisionAiApiService : IPrismaDecisionAiApiService
{
    public const string ServiceName = "PrismaDecisionAiApi";
    private readonly IDownstreamApi _downstreamApi;

    public PrismaDecisionAiApiService(IDownstreamApi downstreamApi)
    {
        _downstreamApi = downstreamApi;
    }

    public async Task<GitHubIssueDuplicateCheckResultDto> CheckIssueDuplicatesAsync(
        GitHubIssueIncomingDto issue,
        IReadOnlyCollection<GitHubIssueOutgoingDto> existingIssues,
        CancellationToken ct = default)
    {
        var request = new DuplicateCheckRequest(
            new IssueBody(issue.Feedback),
            existingIssues
                .Where(existing => !string.IsNullOrEmpty(existing.Feedback))
                .Select(existing => new ExistingIssue(existing.Feedback, existing.IssueNumber))
                .ToArray());

        return await _downstreamApi.PostForAppAsync<DuplicateCheckRequest, GitHubIssueDuplicateCheckResultDto>(
                ServiceName,
                request,
                options => options.RelativePath = "github/issues/check-duplicate",
                ct)
            ?? throw new JsonException("The duplicate-check API returned an empty response.");
    }

    private sealed record DuplicateCheckRequest(
        [property: JsonPropertyName("issue")] IssueBody Issue,
        [property: JsonPropertyName("existing_issues")] ExistingIssue[] ExistingIssues);

    private sealed record IssueBody([property: JsonPropertyName("body")] string Body);

    private sealed record ExistingIssue(
        [property: JsonPropertyName("body")] string Body,
        [property: JsonPropertyName("issue_number")] int IssueNumber);
}
