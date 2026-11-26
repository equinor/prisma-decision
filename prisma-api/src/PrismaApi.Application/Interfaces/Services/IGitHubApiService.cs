using PrismaApi.Domain.Dtos;

namespace PrismaApi.Application.Interfaces.Services;

public interface IGitHubApiService
{
    Task<List<GitHubIssueOutgoingDto>> GetOpenIssuesAsync(CancellationToken ct = default);
    Task<GitHubIssueDuplicateCheckResultDto?> CheckIssueDuplicatesAsync(GitHubIssueIncomingDto dto, CancellationToken ct = default);
    Task<GitHubIssueOutgoingDto> CreateIssueAsync(GitHubIssueIncomingDto dto, CancellationToken ct = default);
}
