import React from 'react';

import { CodeLoginScreen } from './CodeLoginScreen';
import { t } from '../i18n/strings';

export function AdminLoginScreen() {
  return <CodeLoginScreen role="admin" brand={t().roleSelect.admin} />;
}
