import { Router } from 'express';
import { ah } from '../lib/asyncHandler';
import { engageKillSwitch, releaseKillSwitch, killSwitchStatus } from '../domain/killswitch';
import { logger } from '../lib/logger';

/** Operator controls. The kill switch stops the executor and the retry scheduler immediately. */
export const adminRouter = Router();

adminRouter.get('/status', ah(async (_req, res) => {
  res.json(await killSwitchStatus());
}));

adminRouter.post('/pause', ah(async (req, res) => {
  const reason = (req.body?.reason as string) ?? 'manual pause';
  await engageKillSwitch(reason);
  logger.warn('admin.kill_switch.engaged', { reason });
  res.json(await killSwitchStatus());
}));

adminRouter.post('/resume', ah(async (_req, res) => {
  await releaseKillSwitch();
  logger.warn('admin.kill_switch.released', {});
  res.json(await killSwitchStatus());
}));
