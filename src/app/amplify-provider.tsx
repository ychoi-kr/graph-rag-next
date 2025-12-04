'use client';

import { ReactNode } from 'react';
import { Amplify } from 'aws-amplify';
import outputs from '../../amplify_outputs.json';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';

Amplify.configure(outputs);

export function AmplifyProvider({ children }: { children: ReactNode }) {
  return <Authenticator>{children}</Authenticator>;
}

