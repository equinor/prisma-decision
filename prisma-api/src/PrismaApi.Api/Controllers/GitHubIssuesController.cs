using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrismaApi.Application.Filters;
using PrismaApi.Application.Interfaces.Services;
using PrismaApi.Domain.Dtos;
using System.Text.Json;

namespace PrismaApi.Api.Controllers;

[ApiController]
[ApiExceptionFilter]
[AllowAnonymous]
[Route("github/feedback")]
public class GitHubIssuesController : ControllerBase
{
    private readonly IGitHubApiService _gitHubApiService;
    private readonly ILogger<GitHubIssuesController> _logger;

    public GitHubIssuesController(IGitHubApiService gitHubApiService, ILogger<GitHubIssuesController> logger)
    {
        _gitHubApiService = gitHubApiService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<List<GitHubIssueOutgoingDto>>> GetOpenIssues(
        CancellationToken ct = default)
    {
        var issues = await _gitHubApiService.GetOpenIssuesAsync(ct);
        return Ok(issues);
    }

    [HttpPost]
    public async Task<ActionResult<GitHubIssueOutgoingDto>> CreateIssue(
        [FromBody] GitHubIssueIncomingDto dto,
        CancellationToken ct = default)
    {
        try
        {
            var issue = await _gitHubApiService.CreateIssueAsync(dto, ct);
            return Created(issue.IssueUrl, issue);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "GitHub feedback submission failed.");
            return Problem(statusCode: StatusCodes.Status502BadGateway,
                title: "Unable to send feedback.", detail: "GitHub could not process the request. Please try again.");
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "GitHub returned an invalid feedback response.");
            return Problem(statusCode: StatusCodes.Status502BadGateway,
                title: "Unable to confirm feedback submission.",
                detail: "GitHub returned an invalid response.");
        }
    }
}
