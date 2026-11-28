using PrismaApi.Domain.Dtos;

namespace PrismaApi.Application.Interfaces.Services;

public interface IPrismaDecisionAiApiService
{
    Task<GitHubIssueDuplicateCheckResultDto> CheckIssueDuplicatesAsync(
        GitHubIssueIncomingDto issue,
        IReadOnlyCollection<GitHubIssueOutgoingDto> existingIssues,
        CancellationToken ct = default);
}
