import mongoose from 'mongoose';
import { createRefreshTokenSchema } from './refreshTokenSchemaFactory.js';

export default mongoose.model('AdminRefreshToken', createRefreshTokenSchema('admin', 'AdminUser'));
