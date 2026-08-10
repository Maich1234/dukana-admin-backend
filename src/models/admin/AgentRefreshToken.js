import mongoose from 'mongoose';
import { createRefreshTokenSchema } from './refreshTokenSchemaFactory.js';

export default mongoose.model('AgentRefreshToken', createRefreshTokenSchema('agent', 'Agent'));
