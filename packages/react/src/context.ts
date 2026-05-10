import { createContext } from 'react';
import type { TenderlaneClient } from '@tenderlane/client';

export const TenderlaneContext = createContext<TenderlaneClient | null>(null);
