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
import _ from 'underscore';
import Backbone from 'backbone';

export default Backbone.Model.extend({
  idAttribute: 'key',

  addExtraAttributes (repositories) {
    const repo = _.findWhere(repositories, { key: this.get('repo') }) || this.get('repo');
    const repoName = repo != null ? repo.name : repo;
    const isManual = this.get('repo') === 'manual';
    const isCustom = this.has('templateKey');
    this.set({
      repoName,
      isManual,
      isCustom
    }, { silent: true });
  },

  getInactiveProfiles (actives, profiles) {
    return actives.map(profile => {
      const profileBase = _.findWhere(profiles, { key: profile.qProfile });
      if (profileBase != null) {
        _.extend(profile, profileBase);
      }
      return profile;
    });
  }
});
