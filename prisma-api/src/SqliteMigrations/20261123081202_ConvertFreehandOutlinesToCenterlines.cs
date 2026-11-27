using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PrismaApi.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ConvertFreehandOutlinesToCenterlines : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(FreehandCenterlineMigration.GetSql(ActiveProvider));
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            throw new NotSupportedException("The original freehand outlines cannot be reconstructed from centerlines. Restore a database backup to undo this migration.");
        }
    }
}
