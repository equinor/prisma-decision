namespace PrismaApi.Infrastructure.Migrations;

public static class FreehandCenterlineMigration
{
    public static string GetSql(string provider) => provider switch
    {
        "Microsoft.EntityFrameworkCore.Sqlite" => BuildSql(sqlite: true),
        "Microsoft.EntityFrameworkCore.SqlServer" => BuildSql(sqlite: false),
        _ => throw new NotSupportedException($"Freehand migration does not support {provider}."),
    };

    private static string BuildSql(bool sqlite)
    {
        var concatenate = sqlite ? "||" : "+";
        var pointsTable = sqlite ? "FreehandOutlinePoints" : "#FreehandOutlinePoints";
        var segmentsTable = sqlite ? "FreehandOutlineSegments" : "#FreehandOutlineSegments";
        var recursive = sqlite ? " RECURSIVE" : "";
        var endQuery = sqlite ? ";" : "OPTION (MAXRECURSION 0);";
        var coordinates = sqlite
            ? """
              SELECT p.Id, CAST(j.key AS int) AS PointIndex,
                     CAST(json_extract(j.value, '$[0]') AS float) AS X,
                     CAST(json_extract(j.value, '$[1]') AS float) AS Y
              FROM Paths p, json_each(p.Points) j
              """
            : """
              SELECT p.Id, CAST(j.[key] AS int) AS PointIndex,
                     CAST(JSON_VALUE(j.value, '$[0]') AS float) AS X,
                     CAST(JSON_VALUE(j.value, '$[1]') AS float) AS Y
              INTO #FreehandOutlinePoints
              FROM Paths p CROSS APPLY OPENJSON(p.Points) j
              """;
        var pathPart = sqlite
            ? "CASE WHEN PointIndex = 0 THEN 'M' ELSE ' L' END || printf('%.2f,%.2f', X, Y)"
            : """
              CAST(CONCAT(CASE WHEN PointIndex = 0 THEN 'M' ELSE ' L' END,
                          CAST(X AS decimal(20, 2)), ',', CAST(Y AS decimal(20, 2))) AS nvarchar(max))
              """;
        var aggregate = sqlite
            ? "group_concat(PathPart, '' ORDER BY PointIndex)"
            : "STRING_AGG(PathPart, '') WITHIN GROUP (ORDER BY PointIndex)";

        // The old writer stored M/Q/T/Z outlines. Flatten the quadratic curves, then average
        // equal-distance samples along opposite sides; the original pointer points were not saved.
        return $"""
            {(sqlite ? $"CREATE TEMP TABLE {pointsTable} AS" : "")}
            WITH Paths AS (
                SELECT Id, '[[' {concatenate}
                    REPLACE(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(UPPER(TRIM(Data)),
                        'M', ''), 'Q', ''), 'T', ''), 'Z', '')), ' ', '],[')
                    {concatenate} ']]' AS Points
                FROM BoardNode
                WHERE Type = 'Freehand' AND UPPER(RTRIM(Data)) LIKE '%Z'
            )
            {coordinates};
            CREATE UNIQUE INDEX IX_FreehandOutlinePoints ON {pointsTable} (Id, PointIndex);

            {(sqlite ? $"CREATE TEMP TABLE {segmentsTable} AS" : "")}
            WITH{recursive}
            Coordinates AS (
                SELECT * FROM {pointsTable}
            ),
            Curves AS (
                SELECT p.Id, p.PointIndex, s.X AS StartX, s.Y AS StartY,
                       c.X AS ControlX, c.Y AS ControlY, p.X AS EndX, p.Y AS EndY
                FROM Coordinates p
                JOIN Coordinates s ON s.Id = p.Id AND s.PointIndex = 0
                JOIN Coordinates c ON c.Id = p.Id AND c.PointIndex = 1
                WHERE p.PointIndex = 2
                UNION ALL
                SELECT p.Id, p.PointIndex, q.EndX, q.EndY,
                       2 * q.EndX - q.ControlX, 2 * q.EndY - q.ControlY, p.X, p.Y
                FROM Curves q
                JOIN Coordinates p ON p.Id = q.Id AND p.PointIndex = q.PointIndex + 1
            ),
            CurveSteps AS (
                SELECT 1 AS SampleIndex
                UNION ALL
                SELECT SampleIndex + 1 FROM CurveSteps WHERE SampleIndex < 8
            ),
            CurveSamples AS (
                SELECT q.*, i.SampleIndex, CAST(i.SampleIndex AS float) / 8 AS T
                FROM Curves q CROSS JOIN CurveSteps i
            ),
            FlattenedPoints AS (
                SELECT Id, 0 AS PointIndex, X, Y FROM Coordinates WHERE PointIndex = 0
                UNION ALL
                SELECT Id, (PointIndex - 2) * 8 + SampleIndex,
                       (1 - T) * (1 - T) * StartX + 2 * (1 - T) * T * ControlX + T * T * EndX,
                       (1 - T) * (1 - T) * StartY + 2 * (1 - T) * T * ControlY + T * T * EndY
                FROM CurveSamples
            ),
            SegmentEnds AS (
                SELECT *,
                       COALESCE(LEAD(X) OVER (PARTITION BY Id ORDER BY PointIndex),
                                FIRST_VALUE(X) OVER (PARTITION BY Id ORDER BY PointIndex)) AS NextX,
                       COALESCE(LEAD(Y) OVER (PARTITION BY Id ORDER BY PointIndex),
                                FIRST_VALUE(Y) OVER (PARTITION BY Id ORDER BY PointIndex)) AS NextY
                FROM FlattenedPoints
            ),
            SegmentLengths AS (
                SELECT *, SQRT((NextX - X) * (NextX - X) + (NextY - Y) * (NextY - Y)) AS Length
                FROM SegmentEnds
            ),
            MeasuredSegments AS (
                SELECT *,
                       COALESCE(SUM(Length) OVER (PARTITION BY Id ORDER BY PointIndex
                           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS StartDistance,
                       SUM(Length) OVER (PARTITION BY Id ORDER BY PointIndex
                           ROWS UNBOUNDED PRECEDING) AS EndDistance
                FROM SegmentLengths
            )
            SELECT * {(sqlite ? "" : $"INTO {segmentsTable}")} FROM MeasuredSegments
            {endQuery}
            CREATE UNIQUE INDEX IX_FreehandOutlineSegments ON {segmentsTable} (Id, PointIndex);

            WITH{recursive}
            Coordinates AS (
                SELECT * FROM {pointsTable}
            ),
            MeasuredSegments AS (
                SELECT * FROM {segmentsTable}
            ),
            SampleIndices AS (
                SELECT 0 AS SampleIndex
                UNION ALL
                SELECT SampleIndex + 1 FROM SampleIndices WHERE SampleIndex < 2048
            ),
            StrokeLengths AS (
                SELECT Id, MAX(EndDistance) AS TotalLength,
                       CASE WHEN MAX(EndDistance) >= 8192 THEN 2048
                            ELSE CAST(MAX(EndDistance) / 4 AS int) + 1 END AS SampleCount
                FROM MeasuredSegments GROUP BY Id
            ),
            Directions AS (
                SELECT 0 AS Direction UNION ALL SELECT 1
            ),
            SampleDistances AS (
                SELECT s.Id, i.SampleIndex, s.TotalLength,
                       CASE WHEN d.Direction = 0
                            THEN s.TotalLength * i.SampleIndex / (2.0 * s.SampleCount)
                            ELSE s.TotalLength - s.TotalLength * i.SampleIndex / (2.0 * s.SampleCount)
                       END AS Distance
                FROM StrokeLengths s
                JOIN SampleIndices i ON i.SampleIndex <= s.SampleCount
                CROSS JOIN Directions d
                WHERE s.TotalLength > 0
            ),
            DistanceEvents AS (
                SELECT Id, StartDistance AS Distance, PointIndex AS SegmentIndex,
                       CAST(NULL AS int) AS SampleIndex, 0 AS EventKind
                FROM MeasuredSegments WHERE Length > 0
                UNION ALL
                SELECT Id, Distance, NULL, SampleIndex, 1 FROM SampleDistances
            ),
            LocatedSamples AS (
                SELECT *,
                       MAX(SegmentIndex) OVER (PARTITION BY Id ORDER BY Distance, EventKind
                           ROWS UNBOUNDED PRECEDING) AS LocatedSegmentIndex
                FROM DistanceEvents
            ),
            CenterlinePoints AS (
                SELECT d.Id, d.SampleIndex AS PointIndex,
                       AVG(s.X + (s.NextX - s.X) * (d.Distance - s.StartDistance) / s.Length) AS X,
                       AVG(s.Y + (s.NextY - s.Y) * (d.Distance - s.StartDistance) / s.Length) AS Y
                FROM LocatedSamples d
                JOIN MeasuredSegments s ON s.Id = d.Id AND s.PointIndex = d.LocatedSegmentIndex
                WHERE d.SampleIndex IS NOT NULL
                GROUP BY d.Id, d.SampleIndex
                UNION ALL
                SELECT c.Id, i.SampleIndex, c.X, c.Y
                FROM Coordinates c
                JOIN StrokeLengths s ON s.Id = c.Id AND s.TotalLength = 0
                CROSS JOIN SampleIndices i
                WHERE c.PointIndex = 0 AND i.SampleIndex <= 1
            ),
            PathParts AS (
                SELECT Id, PointIndex, {pathPart} AS PathPart
                FROM CenterlinePoints
            ),
            Centerlines AS (
                SELECT Id, {aggregate} AS Path FROM PathParts GROUP BY Id
            )
            UPDATE BoardNode SET Data = Centerlines.Path
            FROM Centerlines WHERE BoardNode.Id = Centerlines.Id
            {endQuery}
            DROP TABLE {segmentsTable};
            DROP TABLE {pointsTable};
            """;
    }
}
