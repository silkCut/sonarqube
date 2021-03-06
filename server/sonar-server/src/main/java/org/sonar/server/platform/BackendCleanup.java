/*
 * SonarQube
 * Copyright (C) 2009-2016 SonarSource SA
 * mailto:contact AT sonarsource DOT com
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */
package org.sonar.server.platform;

import com.google.common.collect.ImmutableMap;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.apache.commons.dbutils.DbUtils;
import org.sonar.api.server.ServerSide;
import org.sonar.api.utils.log.Loggers;
import org.sonar.db.DbSession;
import org.sonar.db.MyBatis;
import org.sonar.db.version.SqTables;
import org.sonar.server.component.es.ProjectMeasuresIndexDefinition;
import org.sonar.server.es.BulkIndexer;
import org.sonar.server.es.EsClient;
import org.sonar.server.issue.index.IssueIndexDefinition;
import org.sonar.server.property.InternalProperties;
import org.sonar.server.view.index.ViewIndexDefinition;

import static org.elasticsearch.index.query.QueryBuilders.matchAllQuery;

@ServerSide
public class BackendCleanup {

  private static final String[] INSPECTION_TABLES = {
    "authors", "duplications_index", "events", "issues", "issue_changes", "manual_measures",
    "notifications", "project_links", "project_measures", "projects", "resource_index",
    "snapshots", "file_sources"
  };
  private static final String[] RESOURCE_RELATED_TABLES = {
    "group_roles", "user_roles", "properties"
  };
  private static final Map<String, TableCleaner> TABLE_CLEANERS = ImmutableMap.of(
    "organizations", BackendCleanup::truncateOrganizations,
    "users", BackendCleanup::truncateUsers,
    "internal_properties", BackendCleanup::truncateInternalProperties,
    "schema_migrations", BackendCleanup::truncateSchemaMigrations);

  private final EsClient esClient;
  private final MyBatis myBatis;

  public BackendCleanup(EsClient esClient, MyBatis myBatis) {
    this.esClient = esClient;
    this.myBatis = myBatis;
  }

  public void clearAll() {
    clearDb();
    clearIndexes();
  }

  public void clearDb() {
    try (DbSession dbSession = myBatis.openSession(false);
      Connection connection = dbSession.getConnection();
      Statement ddlStatement = connection.createStatement()) {
      for (String tableName : SqTables.TABLES) {
        Optional.ofNullable(TABLE_CLEANERS.get(tableName))
          .orElse(BackendCleanup::truncateDefault)
          .clean(tableName, ddlStatement, connection);
      }
    } catch (Exception e) {
      throw new IllegalStateException("Fail to clear db", e);
    }
  }

  public void clearIndexes() {
    Loggers.get(getClass()).info("Truncate Elasticsearch indices");
    try {
      esClient.prepareClearCache().get();

      for (String index : esClient.prepareState().get().getState().getMetaData().concreteAllIndices()) {
        clearIndex(index);
      }
    } catch (Exception e) {
      throw new IllegalStateException("Unable to clear indexes", e);
    }
  }

  /**
   * Reset data in order to to be in same state as a fresh installation (but without having to drop db and restart the server).
   *
   * Please be careful when updating this method as it's called by Orchestrator.
   */
  public void resetData() {
    DbSession dbSession = myBatis.openSession(false);
    Connection connection = dbSession.getConnection();
    Statement statement = null;
    try {
      statement = connection.createStatement();
      // Clear inspection tables
      for (String table : INSPECTION_TABLES) {
        statement.execute("TRUNCATE TABLE " + table.toLowerCase());
        // commit is useless on some databases
        connection.commit();
      }

      // Clear resource related tables
      for (String relatedTable : RESOURCE_RELATED_TABLES) {
        deleteWhereResourceIdNotNull(relatedTable, connection);
      }

      deleteManualRules(connection);

      clearIndex(IssueIndexDefinition.INDEX);
      clearIndex(ViewIndexDefinition.INDEX);
      clearIndex(ProjectMeasuresIndexDefinition.INDEX_PROJECT_MEASURES);

    } catch (SQLException e) {
      throw new IllegalStateException("Fail to reset data", e);
    } finally {
      DbUtils.closeQuietly(statement);
      DbUtils.closeQuietly(connection);
      MyBatis.closeQuietly(dbSession);
    }
  }

  private static void deleteWhereResourceIdNotNull(String tableName, Connection connection) {
    PreparedStatement statement = null;
    try {
      statement = connection.prepareStatement("DELETE FROM " + tableName + " WHERE resource_id IS NOT NULL");
      statement.execute();
      // commit is useless on some databases
      connection.commit();
    } catch (SQLException e) {
      throw new IllegalStateException("Fail to delete table : " + tableName, e);
    } finally {
      DbUtils.closeQuietly(statement);
    }
  }

  private static void deleteManualRules(Connection connection) {
    PreparedStatement statement = null;
    try {
      statement = connection.prepareStatement("DELETE FROM rules WHERE rules.plugin_name='manual'");
      statement.execute();
      // commit is useless on some databases
      connection.commit();
    } catch (SQLException e) {
      throw new IllegalStateException("Fail to remove manual rules", e);
    } finally {
      DbUtils.closeQuietly(statement);
    }
  }

  /**
   * Completely remove a index with all types
   */
  public void clearIndex(String indexName) {
    BulkIndexer.delete(esClient, indexName, esClient.prepareSearch(indexName).setQuery(matchAllQuery()));
  }

  @FunctionalInterface
  private interface TableCleaner {
    void clean(String tableName, Statement ddlStatement, Connection connection) throws SQLException;
  }

  private static void truncateDefault(String tableName, Statement ddlStatement, Connection connection) throws SQLException {
    ddlStatement.execute("TRUNCATE TABLE " + tableName.toLowerCase(Locale.ENGLISH));
    // commit is useless on some databases
    connection.commit();
  }

  /**
   * Default organization must never be deleted
   */
  private static void truncateOrganizations(String tableName, Statement ddlStatement, Connection connection) throws SQLException {
    try (PreparedStatement preparedStatement = connection.prepareStatement("delete from organizations where kee <> ?")) {
      preparedStatement.setString(1, "default-organization");
      preparedStatement.execute();
      // commit is useless on some databases
      connection.commit();
    }
  }

  /**
   * User admin must never be deleted.
   */
  private static void truncateUsers(String tableName, Statement ddlStatement, Connection connection) throws SQLException {
    try (PreparedStatement preparedStatement = connection.prepareStatement("delete from users where login <> ?")) {
      preparedStatement.setString(1, "admin");
      preparedStatement.execute();
      // commit is useless on some databases
      connection.commit();
    }
  }

  /**
   * Internal property {@link InternalProperties#DEFAULT_ORGANIZATION} must never be deleted.
   */
  private static void truncateInternalProperties(String tableName, Statement ddlStatement, Connection connection) throws SQLException {
    try (PreparedStatement preparedStatement = connection.prepareStatement("delete from internal_properties where kee <> ?")) {
      preparedStatement.setString(1, InternalProperties.DEFAULT_ORGANIZATION);
      preparedStatement.execute();
      // commit is useless on some databases
      connection.commit();
    }
  }

  /**
   * Data in SCHEMA_MIGRATIONS table is inserted when DB is created and should not be altered afterwards.
   */
  private static void truncateSchemaMigrations(String tableName, Statement ddlStatement, Connection connection) throws SQLException {
    // do nothing
  }

}
