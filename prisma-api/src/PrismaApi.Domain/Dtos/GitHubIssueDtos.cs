using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PrismaApi.Domain.Dtos;

/// <summary>Feedback and its displayed context, formatted as Markdown.</summary>
public class GitHubIssueIncomingDto
{
    [JsonPropertyName("feedback")]
    public required string Feedback { get; init; }

    [JsonPropertyName("type")]
    public required string Type { get; init; }
}

/// <summary>A GitHub issue created from feedback.</summary>
public class GitHubIssueOutgoingDto : GitHubIssueIncomingDto
{
    [JsonPropertyName("issue_number")]
    public int IssueNumber { get; init; }

    [JsonPropertyName("issue_url")]
    public required string IssueUrl { get; init; }

}
/// <summary>Result of a duplicate check for a GitHub issue.</summary>
public class GitHubIssueDuplicateCheckResultDto
{
    [JsonPropertyName("title")]
    public required string Title { get; init; }

    [JsonPropertyName("duplicates")]
    public List<GitHubIssueDuplicateDto> Duplicates { get; init; } = [];
}

/// <summary>An open GitHub issue matching the submitted feedback.</summary>
public class GitHubIssueDuplicateDto
{
    [JsonPropertyName("issue_number")]
    public int IssueNumber { get; init; }
}