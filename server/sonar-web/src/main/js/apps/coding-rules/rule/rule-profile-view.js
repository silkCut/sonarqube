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
import $ from 'jquery';
import _ from 'underscore';
import Backbone from 'backbone';
import Marionette from 'backbone.marionette';
import ProfileActivationView from './profile-activation-view';
import Template from '../templates/rule/coding-rules-rule-profile.hbs';
import confirmDialog from '../confirm-dialog';
import { translate, translateWithParameters } from '../../../helpers/l10n';

export default Marionette.ItemView.extend({
  tagName: 'tr',
  template: Template,

  modelEvents: {
    'change': 'render'
  },

  ui: {
    change: '.coding-rules-detail-quality-profile-change',
    revert: '.coding-rules-detail-quality-profile-revert',
    deactivate: '.coding-rules-detail-quality-profile-deactivate'
  },

  events: {
    'click @ui.change': 'change',
    'click @ui.revert': 'revert',
    'click @ui.deactivate': 'deactivate'
  },

  onRender () {
    this.$('[data-toggle="tooltip"]').tooltip({
      container: 'body'
    });
  },

  change () {
    const that = this;
    const activationView = new ProfileActivationView({
      model: this.model,
      collection: this.model.collection,
      rule: this.options.rule,
      app: this.options.app
    });
    activationView.on('profileActivated', () => {
      that.options.refreshActives();
    });
    activationView.render();
  },

  revert () {
    const that = this;
    const ruleKey = this.options.rule.get('key');
    confirmDialog({
      title: translate('coding_rules.revert_to_parent_definition'),
      html: translateWithParameters('coding_rules.revert_to_parent_definition.confirm', this.getParent().name),
      yesHandler () {
        return $.ajax({
          type: 'POST',
          url: window.baseUrl + '/api/qualityprofiles/activate_rule',
          data: {
            profile_key: that.model.get('qProfile'),
            rule_key: ruleKey,
            reset: true
          }
        }).done(() => {
          that.options.refreshActives();
        });
      }
    });
  },

  deactivate () {
    const that = this;
    const ruleKey = this.options.rule.get('key');
    confirmDialog({
      title: translate('coding_rules.deactivate'),
      html: translateWithParameters('coding_rules.deactivate.confirm'),
      yesHandler () {
        return $.ajax({
          type: 'POST',
          url: window.baseUrl + '/api/qualityprofiles/deactivate_rule',
          data: {
            profile_key: that.model.get('qProfile'),
            rule_key: ruleKey
          }
        }).done(() => {
          that.options.refreshActives();
        });
      }
    });
  },

  enableUpdate () {
    return this.ui.update.prop('disabled', false);
  },

  getParent () {
    if (!(this.model.get('inherit') && this.model.get('inherit') !== 'NONE')) {
      return null;
    }
    const myProfile = _.findWhere(this.options.app.qualityProfiles, {
      key: this.model.get('qProfile')
    });
    const parentKey = myProfile.parentKey;
    const parent = _.extend({}, _.findWhere(this.options.app.qualityProfiles, {
      key: parentKey
    }));
    const parentActiveInfo = this.model.collection.findWhere({ qProfile: parentKey }) || new Backbone.Model();
    _.extend(parent, parentActiveInfo.toJSON());
    return parent;
  },

  enhanceParameters () {
    const parent = this.getParent();
    const params = _.sortBy(this.model.get('params'), 'key');
    if (!parent) {
      return params;
    }
    return params.map(p => {
      const parentParam = _.findWhere(parent.params, { key: p.key });
      if (parentParam != null) {
        return _.extend(p, {
          original: _.findWhere(parent.params, { key: p.key }).value
        });
      } else {
        return p;
      }
    });
  },

  serializeData () {
    return _.extend(Marionette.ItemView.prototype.serializeData.apply(this, arguments), {
      canWrite: this.options.app.canWrite,
      parent: this.getParent(),
      parameters: this.enhanceParameters(),
      templateKey: this.options.rule.get('templateKey'),
      isTemplate: this.options.rule.get('isTemplate')
    });
  }
});
