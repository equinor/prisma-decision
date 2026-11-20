using PrismaApi.Domain.Constants;
using PrismaApi.Domain.Dtos;
using PrismaApi.Domain.Utilities;
using PrismaDotnetApi.PrismaApi.Domain.Extensions;

namespace PrismaApi.Domain.TableShapes;

/// <summary>
/// Rebuilds Probability, Utility and Restriction tables so their cells match their Table shape.
/// This is the source of truth for Table shape rules; the UI has a TypeScript port held to the same
/// fixtures in test-fixtures/table-shape. Keep both in sync.
/// </summary>
public static class TableShapeBuilder
{
    public const int MaxTableEntryCount = 500;

    /// <summary>
    /// Rebuilds every table in a project, after dropping cells that reference States, Issues or edges
    /// that no longer exist (the database removes those before a rebuild runs).
    /// Cells of Issues that are not Uncertainties or Utilities are left untouched.
    /// </summary>
    public static TableShapeTables RebuildAll(TableShapeProject project)
    {
        var issuesByNodeId = project.Issues
            .Where(issue => issue.Node != null)
            .ToDictionary(issue => issue.Node!.Id);
        var stateIds = project.Issues
            .SelectMany(issue => (issue.Uncertainty?.Outcomes ?? []).Concat(issue.Decision?.Options ?? []))
            .Select(state => state.Id)
            .ToHashSet();
        var edges = project.Edges
            .Where(edge => issuesByNodeId.ContainsKey(edge.TailId) && issuesByNodeId.ContainsKey(edge.HeadId))
            .ToList();
        var uncertaintyIds = project.Issues
            .Where(issue => issue.Uncertainty != null)
            .Select(issue => issue.Uncertainty!.Id)
            .ToHashSet();
        var utilityIds = project.Issues
            .Where(issue => issue.Utility != null)
            .Select(issue => issue.Utility!.Id)
            .ToHashSet();

        var probabilities = project.DiscreteProbabilities
            .Where(probability =>
                uncertaintyIds.Contains(probability.UncertaintyId) &&
                stateIds.Contains(probability.OutcomeId) &&
                probability.ParentOutcomeIds.Concat(probability.ParentOptionIds).All(stateIds.Contains))
            .ToList();
        var utilities = project.DiscreteUtilities
            .Where(utility =>
                utilityIds.Contains(utility.UtilityId) &&
                utility.ParentOutcomeIds.Concat(utility.ParentOptionIds).All(stateIds.Contains))
            .ToList();

        List<TableShapeIssue> ParentsOf(TableShapeIssue issue) => issue.Node == null
            ? []
            : edges.Where(edge => edge.HeadId == issue.Node.Id).Select(edge => issuesByNodeId[edge.TailId]).ToList();

        var rebuiltUncertaintyIds = new HashSet<Guid>();
        var rebuiltUtilityIds = new HashSet<Guid>();
        var resultProbabilities = new List<DiscreteProbabilityDto>();
        var resultUtilities = new List<DiscreteUtilityDto>();
        foreach (var issue in project.Issues)
        {
            if (IsIssueType(issue.Type, IssueType.Uncertainty) && issue.Uncertainty != null)
            {
                rebuiltUncertaintyIds.Add(issue.Uncertainty.Id);
                resultProbabilities.AddRange(RebuildProbabilityTable(
                    issue,
                    ParentsOf(issue),
                    probabilities.Where(probability => probability.UncertaintyId == issue.Uncertainty.Id).ToList()));
            }
            else if (IsIssueType(issue.Type, IssueType.Utility) && issue.Utility != null)
            {
                rebuiltUtilityIds.Add(issue.Utility.Id);
                resultUtilities.AddRange(RebuildUtilityTable(
                    issue,
                    ParentsOf(issue),
                    utilities.Where(utility => utility.UtilityId == issue.Utility.Id).ToList()));
            }
        }
        resultProbabilities.AddRange(probabilities.Where(probability => !rebuiltUncertaintyIds.Contains(probability.UncertaintyId)));
        resultUtilities.AddRange(utilities.Where(utility => !rebuiltUtilityIds.Contains(utility.UtilityId)));

        var edgesById = edges.ToDictionary(edge => edge.Id);
        var resultRestrictionTables = new List<RestrictionTableIncomingDto>();
        foreach (var table in project.RestrictionTables)
        {
            if (!edgesById.TryGetValue(table.EdgeId, out var edge))
            {
                continue;
            }
            var existingEntries = table.RestrictionEntries
                .Where(entry =>
                    entry.ParentStateId is Guid parentStateId && stateIds.Contains(parentStateId) &&
                    entry.ChildStateId is Guid childStateId && stateIds.Contains(childStateId))
                .ToList();
            var entries = RebuildRestrictionTable(table, issuesByNodeId[edge.TailId], issuesByNodeId[edge.HeadId], existingEntries);
            if (entries == null)
            {
                continue;
            }
            resultRestrictionTables.Add(new RestrictionTableIncomingDto
            {
                Id = table.Id,
                ProjectId = table.ProjectId,
                EdgeId = table.EdgeId,
                Name = table.Name,
                RestrictionEntries = entries.Select(ToIncomingDto).ToList(),
            });
        }

        return new TableShapeTables
        {
            DiscreteProbabilities = resultProbabilities,
            DiscreteUtilities = resultUtilities,
            RestrictionTables = resultRestrictionTables,
        };
    }

    /// <summary>
    /// Returns the cells an Uncertainty's Probability table must have.
    /// Cells whose key already exists are returned as they are; new cells get deterministic IDs.
    /// Returns no cells when the table would exceed <see cref="MaxTableEntryCount"/>.
    /// </summary>
    /// <param name="parentIssues">The tail Issues of every edge into the Issue, in edge order.</param>
    public static List<DiscreteProbabilityDto> RebuildProbabilityTable(
        TableShapeIssue issue,
        IEnumerable<TableShapeIssue> parentIssues,
        IReadOnlyCollection<DiscreteProbabilityDto> existingProbabilities)
    {
        var uncertainty = issue.Uncertainty
            ?? throw new InvalidOperationException("Uncertainty cannot be null during table rebuild");
        var parentGroups = CollectParentStateGroups(parentIssues);

        if (WouldExceedTableEntryLimit(
            uncertainty.Outcomes.Count,
            parentGroups.Select(group => group.StateIds.Count)))
        {
            return [];
        }

        var expandedProbabilities = existingProbabilities.Select(Clone).ToList();
        if (expandedProbabilities.Count != 0)
        {
            // Add rows to the Probability table for each combination of parent states.
            ExpandProbabilityParents(issue.Id, expandedProbabilities, parentGroups);

            // Add columns for any new outcomes that are not already represented in the expanded probabilities.
            var representedOutcomeIds = expandedProbabilities
                .Select(probability => probability.OutcomeId)
                .ToHashSet();
            foreach (var addedOutcomeId in uncertainty.Outcomes
                .Select(outcome => outcome.Id)
                .Where(outcomeId => !representedOutcomeIds.Contains(outcomeId)))
            {
                expandedProbabilities.AddProbabilitiesColumn(issue.Id, addedOutcomeId);
            }
        }

        var desiredProbabilities = BuildDesiredProbabilities(issue, uncertainty, parentGroups, expandedProbabilities);
        return KeepExisting(existingProbabilities, desiredProbabilities, ProbabilityKey);
    }

    /// <summary>
    /// Returns the cells a Utility's Utility table must have.
    /// Cells whose key already exists are returned as they are; new cells get deterministic IDs.
    /// Returns no cells when the Utility has no Parents or the table would exceed <see cref="MaxTableEntryCount"/>.
    /// </summary>
    /// <param name="parentIssues">The tail Issues of every edge into the Issue, in edge order.</param>
    public static List<DiscreteUtilityDto> RebuildUtilityTable(
        TableShapeIssue issue,
        IEnumerable<TableShapeIssue> parentIssues,
        IReadOnlyCollection<DiscreteUtilityDto> existingUtilities)
    {
        var utility = issue.Utility
            ?? throw new InvalidOperationException("Utility cannot be null during table rebuild");
        var parentGroups = CollectParentStateGroups(parentIssues);

        if (parentGroups.Count != 0 &&
            WouldExceedTableEntryLimit(parentGroups.Select(group => group.StateIds.Count)))
        {
            return [];
        }

        var expandedUtilities = existingUtilities.Select(Clone).ToList();
        if (expandedUtilities.Count != 0)
        {
            // Add rows to the Utility table for each combination of parent states.
            ExpandUtilityParents(issue.Id, expandedUtilities, parentGroups);
        }

        var desiredUtilities = BuildDesiredUtilities(issue, utility, parentGroups, expandedUtilities);
        return KeepExisting(existingUtilities, desiredUtilities, UtilityKey);
    }

    /// <summary>
    /// Returns the entries a Restriction table must have, or null when the table must be deleted
    /// because one of its ends is not an in-scope key Uncertainty or Focus Decision.
    /// Existing entries keep their values; new entries default to <see cref="DomainConstants.DefaultRestrictionValue"/>.
    /// Returns no entries when the table would exceed <see cref="MaxTableEntryCount"/>.
    /// </summary>
    public static List<RestrictionEntryDto>? RebuildRestrictionTable(
        RestrictionTableDto restrictionTable,
        TableShapeIssue parentIssue,
        TableShapeIssue childIssue,
        IReadOnlyCollection<RestrictionEntryDto> existingEntries)
    {
        if (!IsBoundaryInScope(parentIssue.Boundary) ||
            !IsBoundaryInScope(childIssue.Boundary) ||
            !IsIssueConfiguredInInfluenceDiagram(parentIssue) ||
            !IsIssueConfiguredInInfluenceDiagram(childIssue))
        {
            return null;
        }

        var isParentUncertainty = IsIssueType(parentIssue.Type, IssueType.Uncertainty) && parentIssue.Uncertainty != null;
        var isChildUncertainty = IsIssueType(childIssue.Type, IssueType.Uncertainty) && childIssue.Uncertainty != null;
        var parentIds = StateIds(parentIssue, isParentUncertainty);
        var childIds = StateIds(childIssue, isChildUncertainty);

        if (WouldExceedTableEntryLimit(parentIds.Count, childIds.Count))
        {
            return [];
        }

        var validCombinations = (from parentId in parentIds
                                 from childId in childIds
                                 select (ParentId: (Guid?)parentId, ChildId: (Guid?)childId)).ToList();
        var existingCombinations = existingEntries
            .Select(entry => (ParentId: entry.ParentStateId, ChildId: entry.ChildStateId))
            .ToHashSet();

        var keptEntries = existingEntries
            .Where(entry => validCombinations.Contains((entry.ParentStateId, entry.ChildStateId)));
        var addedEntries = validCombinations
            .Where(combination => !existingCombinations.Contains(combination))
            .Select(combination => new RestrictionEntryDto
            {
                Id = IdGenerationUtils.GetDeterministicIdRestrictionEntry(
                    restrictionTable.Id, combination.ParentId!.Value, combination.ChildId!.Value),
                ProjectId = restrictionTable.ProjectId,
                RestrictionTableId = restrictionTable.Id,
                RestrictionValue = DomainConstants.DefaultRestrictionValue,
                ParentStateId = combination.ParentId,
                IsParentUncertainty = isParentUncertainty,
                ChildStateId = combination.ChildId,
                IsChildUncertainty = isChildUncertainty,
            });

        return keptEntries.Concat(addedEntries).ToList();
    }

    public static string ProbabilityKey(DiscreteProbabilityDto probability) => ProbabilityKey(
        probability.OutcomeId,
        probability.ParentOutcomeIds,
        probability.ParentOptionIds);

    public static string ProbabilityKey(Guid outcomeId, IEnumerable<Guid> parentOutcomeIds, IEnumerable<Guid> parentOptionIds) =>
        $"{outcomeId}|{string.Join(',', parentOutcomeIds.OrderBy(id => id))}|{string.Join(',', parentOptionIds.OrderBy(id => id))}";

    public static string UtilityKey(DiscreteUtilityDto utility) => UtilityKey(
        utility.ValueMetricId,
        utility.ParentOutcomeIds,
        utility.ParentOptionIds);

    public static string UtilityKey(Guid valueMetricId, IEnumerable<Guid> parentOutcomeIds, IEnumerable<Guid> parentOptionIds) =>
        $"{valueMetricId}|{string.Join(',', parentOutcomeIds.OrderBy(id => id))}|{string.Join(',', parentOptionIds.OrderBy(id => id))}";

    /// <summary>
    /// Keeps the first existing cell for every desired key, so existing IDs and values survive a rebuild.
    /// </summary>
    private static List<T> KeepExisting<T>(
        IEnumerable<T> existing,
        IEnumerable<T> desired,
        Func<T, string> key)
    {
        var existingByKey = existing
            .GroupBy(key)
            .ToDictionary(group => group.Key, group => group.First());
        return desired
            .Select(cell => existingByKey.GetValueOrDefault(key(cell)) ?? cell)
            .ToList();
    }

    private static void ExpandProbabilityParents(
        Guid issueId,
        ICollection<DiscreteProbabilityDto> probabilities,
        IEnumerable<ParentStateGroup> parentGroups)
    {
        foreach (var parentGroup in parentGroups)
        {
            var representedStateIds = parentGroup.StateIds
                .Where(stateId => probabilities.Any(probability =>
                    probability.ParentOutcomeIds.Contains(stateId) ||
                    probability.ParentOptionIds.Contains(stateId)))
                .ToList();
            var addedStateIds = parentGroup.StateIds.Except(representedStateIds).ToList();

            if (representedStateIds.Count == 0)
            {
                probabilities.AddProbabilityParent(issueId, addedStateIds, parentGroup.IsUncertainty);
                continue;
            }

            foreach (var addedStateId in addedStateIds)
            {
                probabilities.AddProbabilitiesRow(issueId, addedStateId, representedStateIds);
            }
        }
    }

    private static void ExpandUtilityParents(
        Guid issueId,
        ICollection<DiscreteUtilityDto> utilities,
        IEnumerable<ParentStateGroup> parentGroups)
    {
        foreach (var parentGroup in parentGroups)
        {
            var representedStateIds = parentGroup.StateIds
                .Where(stateId => utilities.Any(utility =>
                    utility.ParentOutcomeIds.Contains(stateId) ||
                    utility.ParentOptionIds.Contains(stateId)))
                .ToList();
            var addedStateIds = parentGroup.StateIds.Except(representedStateIds).ToList();

            if (representedStateIds.Count == 0)
            {
                utilities.AddUtilityParent(issueId, addedStateIds, !parentGroup.IsUncertainty);
                continue;
            }

            foreach (var addedStateId in addedStateIds)
            {
                utilities.AddUtilitiesRow(issueId, addedStateId, representedStateIds);
            }
        }
    }

    private static List<DiscreteProbabilityDto> BuildDesiredProbabilities(
        TableShapeIssue issue,
        TableShapeUncertainty uncertainty,
        IReadOnlyCollection<ParentStateGroup> parentGroups,
        ICollection<DiscreteProbabilityDto> expandedProbabilities)
    {
        var expandedByKey = expandedProbabilities
            .GroupBy(ProbabilityKey)
            .ToDictionary(group => group.Key, group => group.First());
        var combinations = BuildCombinations(parentGroups.Select(group => group.StateIds).ToList());
        var outcomeStateIds = parentGroups
            .Where(group => group.IsUncertainty)
            .SelectMany(group => group.StateIds)
            .ToHashSet();

        return (from outcome in uncertainty.Outcomes
                from combination in combinations
                let parentOutcomeIds = combination.Where(outcomeStateIds.Contains).OrderBy(id => id).ToList()
                let parentOptionIds = combination.Where(id => !outcomeStateIds.Contains(id)).OrderBy(id => id).ToList()
                let key = ProbabilityKey(outcome.Id, parentOutcomeIds, parentOptionIds)
                let expanded = expandedByKey.GetValueOrDefault(key)
                select new DiscreteProbabilityDto
                {
                    Id = IdGenerationUtils.GetDeterministicIdProbability(issue.Id, outcome.Id, parentOutcomeIds, parentOptionIds),
                    OutcomeId = outcome.Id,
                    UncertaintyId = uncertainty.Id,
                    ProjectId = issue.ProjectId,
                    Probability = expanded?.Probability ?? 0,
                    ParentOutcomeIds = parentOutcomeIds,
                    ParentOptionIds = parentOptionIds
                }).ToList();
    }

    private static List<DiscreteUtilityDto> BuildDesiredUtilities(
        TableShapeIssue issue,
        TableShapeUtility utility,
        IReadOnlyCollection<ParentStateGroup> parentGroups,
        ICollection<DiscreteUtilityDto> expandedUtilities)
    {
        if (parentGroups.Count == 0)
        {
            return [];
        }

        var expandedByKey = expandedUtilities
            .GroupBy(UtilityKey)
            .ToDictionary(group => group.Key, group => group.First());
        var combinations = BuildCombinations(parentGroups.Select(group => group.StateIds).ToList());
        var outcomeStateIds = parentGroups
            .Where(group => group.IsUncertainty)
            .SelectMany(group => group.StateIds)
            .ToHashSet();

        // TODO: expand declarative LINQ expression to include additional utility metrics when they are added to the system
        return (from combination in combinations
                let parentOutcomeIds = combination.Where(outcomeStateIds.Contains).OrderBy(id => id).ToList()
                let parentOptionIds = combination.Where(id => !outcomeStateIds.Contains(id)).OrderBy(id => id).ToList()
                let key = UtilityKey(DomainConstants.DefaultValueMetricId, parentOutcomeIds, parentOptionIds)
                let expanded = expandedByKey.GetValueOrDefault(key)
                select new DiscreteUtilityDto
                {
                    Id = IdGenerationUtils.GetDeterministicIdUtility(issue.Id, DomainConstants.DefaultValueMetricId, parentOutcomeIds, parentOptionIds),
                    ValueMetricId = DomainConstants.DefaultValueMetricId,
                    UtilityId = utility.Id,
                    ProjectId = issue.ProjectId,
                    UtilityValue = expanded?.UtilityValue ?? 0,
                    ParentOutcomeIds = parentOutcomeIds,
                    ParentOptionIds = parentOptionIds
                }).ToList();
    }

    /// <summary>
    /// Represents the States of one Parent, either Outcomes of an Uncertainty or Options of a Decision.
    /// </summary>
    private sealed record ParentStateGroup(List<Guid> StateIds, bool IsUncertainty);

    /// <summary>
    /// Collects one State group per Parent. Duplicate edges count once, and only in-scope key
    /// Uncertainties and Focus Decisions are Parents.
    /// </summary>
    private static List<ParentStateGroup> CollectParentStateGroups(IEnumerable<TableShapeIssue> parentIssues)
    {
        return parentIssues
            .DistinctBy(parentIssue => parentIssue.Id)
            .Where(parentIssue => IsBoundaryInScope(parentIssue.Boundary))
            .Select(parentIssue =>
            {
                if (IsIssueType(parentIssue.Type, IssueType.Uncertainty) && parentIssue.Uncertainty?.IsKey == true)
                {
                    return new ParentStateGroup(parentIssue.Uncertainty.Outcomes.Select(outcome => outcome.Id).ToList(), true);
                }

                if (IsIssueType(parentIssue.Type, IssueType.Decision) && IsDecisionFocus(parentIssue.Decision?.Type))
                {
                    return new ParentStateGroup(parentIssue.Decision!.Options.Select(option => option.Id).ToList(), false);
                }

                return null;
            })
            .Where(group => group is not null)
            .Cast<ParentStateGroup>()
            .ToList();
    }

    private static List<Guid> StateIds(TableShapeIssue issue, bool isUncertainty) => isUncertainty
        ? issue.Uncertainty!.Outcomes.Select(outcome => outcome.Id).ToList()
        : issue.Decision!.Options.Select(option => option.Id).ToList();

    private static List<List<Guid>> BuildCombinations(List<List<Guid>> groups)
    {
        var results = new List<List<Guid>> { new() };
        foreach (var group in groups)
        {
            results = results
                .SelectMany(existing => group.Select(item => new List<Guid>(existing) { item }))
                .ToList();
        }

        return results;
    }

    private static bool WouldExceedTableEntryLimit(int initialEntryCount, IEnumerable<int> stateCounts) =>
        WouldExceedTableEntryLimit(stateCounts.Prepend(initialEntryCount));

    private static bool WouldExceedTableEntryLimit(params int[] stateCounts) =>
        WouldExceedTableEntryLimit(stateCounts.AsEnumerable());

    private static bool WouldExceedTableEntryLimit(IEnumerable<int> stateCounts)
    {
        var count = stateCounts.Aggregate(
            1L,
            (entryCount, stateCount) => Math.Min(MaxTableEntryCount + 1L, entryCount * stateCount));
        return count > MaxTableEntryCount;
    }

    private static bool IsBoundaryInScope(string? boundary)
    {
        var normalized = Normalize(boundary);
        return normalized == Normalize(Boundary.In.ToString()) ||
               normalized == Normalize(Boundary.On.ToString());
    }

    private static bool IsIssueType(string? value, IssueType type) =>
        Normalize(value) == Normalize(type.ToString());

    private static bool IsDecisionFocus(string? value) =>
        Normalize(value) == Normalize(DecisionHierarchy.Focus.ToString());

    private static bool IsIssueConfiguredInInfluenceDiagram(TableShapeIssue issue)
    {
        if (IsIssueType(issue.Type, IssueType.Uncertainty) && issue.Uncertainty != null)
        {
            return issue.Uncertainty.IsKey;
        }
        if (IsIssueType(issue.Type, IssueType.Decision) && issue.Decision != null)
        {
            return IsDecisionFocus(issue.Decision.Type);
        }
        return false;
    }

    private static string Normalize(string? value) => (value ?? string.Empty).Trim().ToLowerInvariant();

    private static DiscreteProbabilityDto Clone(DiscreteProbabilityDto probability) => new()
    {
        Id = probability.Id,
        OutcomeId = probability.OutcomeId,
        UncertaintyId = probability.UncertaintyId,
        ProjectId = probability.ProjectId,
        Probability = probability.Probability,
        ParentOutcomeIds = [.. probability.ParentOutcomeIds],
        ParentOptionIds = [.. probability.ParentOptionIds],
    };

    private static DiscreteUtilityDto Clone(DiscreteUtilityDto utility) => new()
    {
        Id = utility.Id,
        ValueMetricId = utility.ValueMetricId,
        UtilityId = utility.UtilityId,
        ProjectId = utility.ProjectId,
        UtilityValue = utility.UtilityValue,
        ParentOutcomeIds = [.. utility.ParentOutcomeIds],
        ParentOptionIds = [.. utility.ParentOptionIds],
    };

    private static RestrictionEntryIncomingDto ToIncomingDto(RestrictionEntryDto entry) => new()
    {
        Id = entry.Id,
        ProjectId = entry.ProjectId,
        RestrictionTableId = entry.RestrictionTableId,
        RestrictionValue = entry.RestrictionValue,
        ParentStateId = entry.ParentStateId,
        IsParentUncertainty = entry.IsParentUncertainty,
        ChildStateId = entry.ChildStateId,
        IsChildUncertainty = entry.IsChildUncertainty,
    };
}
