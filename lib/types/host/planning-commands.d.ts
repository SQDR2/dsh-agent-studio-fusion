import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands';
import type { PhysicalRoute } from '../contracts.js';
import type { FusionCoordinator } from './coordinator.js';
export declare function runPlanningCommand(invocation: CommandInvocation, controller: FusionCoordinator, validateRoute: (route: PhysicalRoute) => Promise<void>): Promise<CommandResult | undefined>;
