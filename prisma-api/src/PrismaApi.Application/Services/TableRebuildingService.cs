using Microsoft.EntityFrameworkCore;
using PrismaApi.Application.Interfaces.Services;
using PrismaApi.Application.Mapping;
using PrismaApi.Domain.Constants;
using PrismaApi.Domain.Dtos;
using PrismaApi.Domain.Entities;
using PrismaApi.Infrastructure.Context;
using PrismaApi.Domain.Extensions;
using PrismaApi.Domain.TableShapes;

namespace PrismaApi.Application.Services;

public class TableRebuildingService : ITableRebuildingService
{
    protected readonly AppDbContext DbContext;
    public TableRebuildingService(AppDbContext dbContext)
    {
        DbContext = dbContext;
    }

    public async Task RebuildTablesAsync(CancellationToken ct = default)
    {
        var issueIds = DbContext.DiscreteTableSessionInfo.AffectedIssueIds.ToHashSet();
        if (issueIds.Count != 0 && !DbContext.IsDiscreteTableEventDisabled)
        {
            await RebuildIssuesFromIssueIds(issueIds, ct);
        }
        var restrictionTableIds = DbContext.DiscreteTableSessionInfo.AffectedRestrictionTables.ToHashSet();
        if (restrictionTableIds.Count != 0 && !DbContext.IsDiscreteTableEventDisabled)
        {
            await RebuildRestrictionTablesFromIds(restrictionTableIds, ct);
        }
        await DbContext.SaveChangesAsync(ct);
        DbContext.DiscreteTableSessionInfo.Clear();
    }

    private async Task RebuildRestrictionTablesFromIds(HashSet<Guid> restrictionTableIds, CancellationToken ct)
    {
        // the data we need is the edges connected to the issues that are parents of the restriction tables, so we can determine the new combinations of parent outcomes and options that should be in the restriction table, then we can delete the existing entries and add the new ones
        // we can get the outcomes and options connected without joining from the restriction table, the issue information is still needed to determine the parent issues and their types, but we can get that with a separate query and then do the rest of the processing in memory
        var restrictionTables = DbContext.RestrictionTables
            .AsSplitQuery()
            .Where(rt => restrictionTableIds.Contains(rt.Id))
            .Include(rt => rt.RestrictionEntries)
            .Include(rt => rt.Edge)
                .ThenInclude(edge => edge!.HeadNode)
                    .ThenInclude(node => node!.Issue)
                        .ThenInclude(issue => issue!.Uncertainty)
                            .ThenInclude(uncertainty => uncertainty!.Outcomes)
            .Include(rt => rt.Edge)
                .ThenInclude(edge => edge!.HeadNode)
                    .ThenInclude(node => node!.Issue)
                        .ThenInclude(issue => issue!.Decision)
                            .ThenInclude(decision => decision!.Options)
            .Include(rt => rt.Edge)
                .ThenInclude(edge => edge!.TailNode)
                    .ThenInclude(node => node!.Issue)
                        .ThenInclude(issue => issue!.Uncertainty)
                            .ThenInclude(uncertainty => uncertainty!.Outcomes)
            .Include(rt => rt.Edge)
                .ThenInclude(edge => edge!.TailNode)
                    .ThenInclude(node => node!.Issue)
                        .ThenInclude(issue => issue!.Decision)
                            .ThenInclude(decision => decision!.Options)
            .AsAsyncEnumerable();

        await foreach (var restrictionTable in restrictionTables.WithCancellation(ct))
        {
            await RebuildRestrictionTable(restrictionTable, ct);
        }
    }

    private async Task RebuildRestrictionTable(RestrictionTable restrictionTable, CancellationToken ct)
    {
        var existingEntries = restrictionTable.RestrictionEntries.ToList();
        var desiredEntries = TableShapeBuilder.RebuildRestrictionTable(
            new RestrictionTableDto
            {
                Id = restrictionTable.Id,
                ProjectId = restrictionTable.ProjectId,
                EdgeId = restrictionTable.EdgeId,
                Name = restrictionTable.Name,
            },
            restrictionTable.Edge!.TailNode!.Issue!.ToTableShapeIssue(),
            restrictionTable.Edge!.HeadNode!.Issue!.ToTableShapeIssue(),
            existingEntries.ToOutgoingDtos());
        if (desiredEntries == null)
        {
            DbContext.RestrictionTables.Remove(restrictionTable);
            return;
        }

        var desiredIds = desiredEntries.Select(entry => entry.Id).ToHashSet();
        var existingIds = existingEntries.Select(entry => entry.Id).ToHashSet();
        DbContext.RestrictionEntries.RemoveRange(existingEntries.Where(entry => !desiredIds.Contains(entry.Id)));
        await DbContext.RestrictionEntries.AddRangeAsync(
            desiredEntries
                .Where(entry => !existingIds.Contains(entry.Id))
                .Select(entry => entry.ToEntity()),
            ct);
    }

    public async Task RebuildIssuesFromIssueIds(ICollection<Guid> issueIds, CancellationToken ct = default)
    {
        var issues = DbContext.Issues
            .AsSplitQuery()
            .Where(issue =>
                issueIds.Contains(issue.Id) &&
                (issue.Type == IssueType.Uncertainty.ToString() ||
                issue.Type == IssueType.Utility.ToString()))
            .Include(issue => issue.Uncertainty!)
                .ThenInclude(uncertainty => uncertainty.Outcomes)
            .Include(issue => issue.Uncertainty!)
                .ThenInclude(uncertainty => uncertainty.DiscreteProbabilities)
                    .ThenInclude(probability => probability.ParentOutcomes)
            .Include(issue => issue.Uncertainty!)
                .ThenInclude(uncertainty => uncertainty.DiscreteProbabilities)
                    .ThenInclude(probability => probability.ParentOptions)
            .Include(issue => issue.Utility!)
                .ThenInclude(utility => utility.DiscreteUtilities)
                    .ThenInclude(utility => utility.ParentOutcomes)
            .Include(issue => issue.Utility!)
                .ThenInclude(utility => utility.DiscreteUtilities)
                    .ThenInclude(utility => utility.ParentOptions)
            .Include(issue => issue.Node!)
                .ThenInclude(node => node.HeadEdges)
                    .ThenInclude(edge => edge.TailNode!)
                        .ThenInclude(node => node.Issue!)
                            .ThenInclude(parentIssue => parentIssue.Uncertainty!)
                                .ThenInclude(uncertainty => uncertainty.Outcomes)
            .Include(issue => issue.Node!)
                .ThenInclude(node => node.HeadEdges)
                    .ThenInclude(edge => edge.TailNode!)
                        .ThenInclude(node => node.Issue!)
                            .ThenInclude(parentIssue => parentIssue.Decision!)
                                .ThenInclude(decision => decision.Options)
            .AsAsyncEnumerable();

        await foreach (var issue in issues.WithCancellation(ct))
        {
            if (IsIssueType(issue.Type, IssueType.Uncertainty) && issue.Uncertainty != null)
            {
                await RebuildUncertaintyTable(issue, ct);
            }
            else if (IsIssueType(issue.Type, IssueType.Utility) && issue.Utility != null)
            {
                await RebuildUtilityTable(issue, ct);
            }
        }

        await DbContext.SaveChangesAsync(ct);
    }


    private async Task RebuildUncertaintyTable(Issue issue, CancellationToken ct = default)
    {
        var existingProbabilities = issue.Uncertainty!.DiscreteProbabilities.ToList();
        var desiredProbabilities = TableShapeBuilder.RebuildProbabilityTable(
            issue.ToTableShapeIssue(),
            ParentIssues(issue),
            existingProbabilities.ToDtos());
        await ReconcileProbabilities(existingProbabilities, desiredProbabilities, ct);
    }

    private async Task RebuildUtilityTable(Issue issue, CancellationToken ct = default)
    {
        var existingUtilities = issue.Utility!.DiscreteUtilities.ToList();
        var desiredUtilities = TableShapeBuilder.RebuildUtilityTable(
            issue.ToTableShapeIssue(),
            ParentIssues(issue),
            existingUtilities.ToDtos());
        await ReconcileUtilities(existingUtilities, desiredUtilities, ct);
    }

    /// <summary>
    /// The tail Issues of the edges pointing to the issue's node.
    /// </summary>
    private static List<TableShapeIssue> ParentIssues(Issue issue) =>
        (issue.Node?.HeadEdges ?? Array.Empty<Edge>())
            .Select(edge => edge.TailNode?.Issue)
            .Where(parentIssue => parentIssue != null)
            .Select(parentIssue => parentIssue!.ToTableShapeIssue())
            .ToList();

    private async Task ReconcileProbabilities(
        ICollection<DiscreteProbability> existingProbabilities,
        ICollection<DiscreteProbabilityDto> desiredProbabilities,
        CancellationToken ct)
    {
        var desiredByKey = desiredProbabilities.ToDictionary(ProbabilityKey);
        var existingGroups = existingProbabilities.GroupBy(ProbabilityKey).ToList();
        var probabilitiesToRemove = existingGroups
            .Where(group => !desiredByKey.ContainsKey(group.Key))
            .SelectMany(group => group)
            .Concat(existingGroups.SelectMany(group => group.Skip(1)))
            .Distinct()
            .ToList();
        RemoveDiscreteProbabilities(probabilitiesToRemove);

        var existingKeys = existingGroups
            .Where(group => desiredByKey.ContainsKey(group.Key))
            .Select(group => group.Key)
            .ToHashSet();
        var probabilitiesToAdd = desiredByKey
            .Where(pair => !existingKeys.Contains(pair.Key))
            .Select(pair => pair.Value.ToEntity())
            .ToList();
        await DbContext.DiscreteProbabilities.AddRangeAsync(probabilitiesToAdd, ct);
    }

    private async Task ReconcileUtilities(
        ICollection<DiscreteUtility> existingUtilities,
        ICollection<DiscreteUtilityDto> desiredUtilities,
        CancellationToken ct)
    {
        var desiredByKey = desiredUtilities.ToDictionary(UtilityKey);
        var existingGroups = existingUtilities.GroupBy(UtilityKey).ToList();
        var utilitiesToRemove = existingGroups
            .Where(group => !desiredByKey.ContainsKey(group.Key))
            .SelectMany(group => group)
            .Concat(existingGroups.SelectMany(group => group.Skip(1)))
            .Distinct()
            .ToList();
        RemoveDiscreteUtilities(utilitiesToRemove);

        var existingKeys = existingGroups
            .Where(group => desiredByKey.ContainsKey(group.Key))
            .Select(group => group.Key)
            .ToHashSet();
        var utilitiesToAdd = desiredByKey
            .Where(pair => !existingKeys.Contains(pair.Key))
            .Select(pair => pair.Value.ToEntity())
            .ToList();
        await DbContext.DiscreteUtilities.AddRangeAsync(utilitiesToAdd, ct);
    }

    private static string ProbabilityKey(DiscreteProbability probability) => TableShapeBuilder.ProbabilityKey(
        probability.OutcomeId,
        probability.ParentOutcomes.Select(parent => parent.ParentOutcomeId),
        probability.ParentOptions.Select(parent => parent.ParentOptionId));

    private static string ProbabilityKey(DiscreteProbabilityDto probability) => TableShapeBuilder.ProbabilityKey(probability);

    private static string UtilityKey(DiscreteUtility utility) => TableShapeBuilder.UtilityKey(
        utility.ValueMetricId,
        utility.ParentOutcomes.Select(parent => parent.ParentOutcomeId),
        utility.ParentOptions.Select(parent => parent.ParentOptionId));

    private static string UtilityKey(DiscreteUtilityDto utility) => TableShapeBuilder.UtilityKey(utility);


    public async Task RemoveExcessDiscreteProbabilities(Guid uncertaintyId, CancellationToken ct = default)
    {
        var discreteProbabilities = await FindExcessDiscreteProbabilities(uncertaintyId, ct);
        RemoveDiscreteProbabilities(discreteProbabilities);
        await DbContext.SaveChangesAsync(ct);
    }

    public async Task RemoveExcessDiscreteProbabilities(CancellationToken ct = default)
    {
        var discreteProbabilities = await FindExcessDiscreteProbabilities(ct);
        RemoveDiscreteProbabilities(discreteProbabilities);
        await DbContext.SaveChangesAsync(ct);
    }

    public async Task RemoveExcessDiscreteUtilities(Guid utilityId, CancellationToken ct = default)
    {
        var discreteUtilities = await FindExcessDiscreteUtility(utilityId, ct);
        RemoveDiscreteUtilities(discreteUtilities);
        await DbContext.SaveChangesAsync(ct);
    }

    public async Task RemoveExcessDiscreteUtilities(CancellationToken ct = default)
    {
        var discreteUtilities = await FindExcessDiscreteUtility(ct);
        RemoveDiscreteUtilities(discreteUtilities);
        await DbContext.SaveChangesAsync(ct);
    }

    private async Task<IEnumerable<DiscreteProbability>> FindExcessDiscreteProbabilities(Guid uncertaintyId, CancellationToken ct = default)
    {
        var discreteProbabilities = await DbContext.DiscreteProbabilities
            .Where(p => p.UncertaintyId == uncertaintyId)
            .Include(p => p.ParentOutcomes)
            .Include(p => p.ParentOptions)
            .ToListAsync(ct);

        return discreteProbabilities
            .GroupBy(p => (
                p.OutcomeId,
                ParentOutcomes: string.Join(",", p.ParentOutcomes.Select(o => o.ParentOutcomeId).OrderBy(id => id)),
                ParentOptions: string.Join(",", p.ParentOptions.Select(o => o.ParentOptionId).OrderBy(id => id))
            ))
            .SelectMany(group => group.Skip(1));
    }

    private async Task<IEnumerable<DiscreteProbability>> FindExcessDiscreteProbabilities(CancellationToken ct = default)
    {
        var discreteProbabilities = await DbContext.DiscreteProbabilities
            .Include(p => p.ParentOutcomes)
            .Include(p => p.ParentOptions)
            .ToListAsync(ct);

        return discreteProbabilities
            .GroupBy(p => (
                p.UncertaintyId,
                p.OutcomeId,
                ParentOutcomes: string.Join(",", p.ParentOutcomes.Select(o => o.ParentOutcomeId).OrderBy(id => id)),
                ParentOptions: string.Join(",", p.ParentOptions.Select(o => o.ParentOptionId).OrderBy(id => id))
            ))
            .SelectMany(group => group.Skip(1));
    }

    private async Task<IEnumerable<DiscreteUtility>> FindExcessDiscreteUtility(Guid utilityId, CancellationToken ct = default)
    {
        var discreteUtilities = await DbContext.DiscreteUtilities
            .Where(p => p.UtilityId == utilityId)
            .Include(p => p.ParentOutcomes)
            .Include(p => p.ParentOptions)
            .ToListAsync(ct);

        return discreteUtilities
            .GroupBy(p => (
                p.ValueMetricId,
                ParentOutcomes: string.Join(",", p.ParentOutcomes.Select(o => o.ParentOutcomeId).OrderBy(id => id)),
                ParentOptions: string.Join(",", p.ParentOptions.Select(o => o.ParentOptionId).OrderBy(id => id))
            ))
            .SelectMany(group => group.Skip(1));
    }

    private async Task<IEnumerable<DiscreteUtility>> FindExcessDiscreteUtility(CancellationToken ct = default)
    {
        var discreteUtilities = await DbContext.DiscreteUtilities
            .Include(p => p.ParentOutcomes)
            .Include(p => p.ParentOptions)
            .ToListAsync(ct);

        var excessDiscreteUtilities = discreteUtilities
            .GroupBy(p => (
                p.UtilityId,
                p.ValueMetricId,
                ParentOutcomes: string.Join(",", p.ParentOutcomes.Select(o => o.ParentOutcomeId).OrderBy(id => id)),
                ParentOptions: string.Join(",", p.ParentOptions.Select(o => o.ParentOptionId).OrderBy(id => id))
            ))
            .SelectMany(group => group.Skip(1));
        return excessDiscreteUtilities;
    }

    private void RemoveDiscreteProbabilities(IEnumerable<DiscreteProbability> discreteProbabilities)
    {
        var discreteProbabilityIds = discreteProbabilities.Select(probability => probability.Id).ToList();
        if (discreteProbabilityIds.Count == 0)
        {
            return;
        }

        DbContext.DiscreteProbabilityParentOutcomes.RemoveRange(
            DbContext.DiscreteProbabilityParentOutcomes.Where(parent => discreteProbabilityIds.Contains(parent.DiscreteProbabilityId)));
        DbContext.DiscreteProbabilityParentOptions.RemoveRange(
            DbContext.DiscreteProbabilityParentOptions.Where(parent => discreteProbabilityIds.Contains(parent.DiscreteProbabilityId)));
        DbContext.DiscreteProbabilities.RemoveRange(discreteProbabilities);
    }

    private void RemoveDiscreteUtilities(IEnumerable<DiscreteUtility> discreteUtilities)
    {
        var discreteUtilityIds = discreteUtilities.Select(utility => utility.Id).ToList();
        if (discreteUtilityIds.Count == 0)
        {
            return;
        }

        DbContext.DiscreteUtilityParentOutcomes.RemoveRange(
            DbContext.DiscreteUtilityParentOutcomes.Where(parent => discreteUtilityIds.Contains(parent.DiscreteUtilityId)));
        DbContext.DiscreteUtilityParentOptions.RemoveRange(
            DbContext.DiscreteUtilityParentOptions.Where(parent => discreteUtilityIds.Contains(parent.DiscreteUtilityId)));
        DbContext.DiscreteUtilities.RemoveRange(discreteUtilities);
    }

    private static bool IsIssueType(string? value, IssueType type) =>
        (value ?? string.Empty).Trim().Equals(type.ToString(), StringComparison.OrdinalIgnoreCase);
}
