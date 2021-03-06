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
import React from 'react';
import { connect } from 'react-redux';
import SettingsNav from './nav/settings/SettingsNav';
import { getCurrentUser } from '../../store/rootReducer';
import { isUserAdmin } from '../../helpers/users';
import { onFail } from '../../store/rootActions';
import { getSettingsNavigation } from '../../api/nav';

class AdminContainer extends React.Component {
  state = {
    loading: true
  };

  componentDidMount () {
    if (!isUserAdmin(this.props.currentUser)) {
      // workaround cyclic dependencies
      const handleRequiredAuthorization = require('../utils/handleRequiredAuthorization').default;
      handleRequiredAuthorization();
    }

    this.mounted = true;
    this.loadData();
  }

  componentWillUnmount () {
    this.mounted = false;
  }

  loadData () {
    getSettingsNavigation().then(
        r => this.setState({ extensions: r.extensions, loading: false }),
        onFail(this.props.dispatch)
    );
  }

  render () {
    if (!isUserAdmin(this.props.currentUser) || this.state.loading) {
      return null;
    }

    return (
        <div>
          <SettingsNav
              location={this.props.location}
              extensions={this.state.extensions}/>
          {this.props.children}
        </div>
    );
  }
}

const mapStateToProps = state => ({
  currentUser: getCurrentUser(state)
});

export default connect(mapStateToProps)(AdminContainer);
