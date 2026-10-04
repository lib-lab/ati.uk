// Time processes of the app: the domain ones plus those that need an adapter (composition root).
import { registryLookupSync } from '../adapters';
import { registryCheckProcess } from '../domain/commands/registration';
import { TIME_PROCESSES, type TimeProcess } from '../domain/commands/time';

export const APP_TIME_PROCESSES: TimeProcess[] = [...TIME_PROCESSES, registryCheckProcess(registryLookupSync)];
