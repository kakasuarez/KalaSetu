import React from 'react';

import { CodeLoginScreen } from './CodeLoginScreen';
import { t } from '../i18n/strings';

export function SakhiLoginScreen() {
  return <CodeLoginScreen role="sakhi" brand={t().roleSelect.coordinator} />;
}
