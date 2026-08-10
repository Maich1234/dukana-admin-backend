import Joi from 'joi';

/** A 24-char hex Mongo ObjectId string. */
export const objectId = () => Joi.string().hex().length(24).message('must be a valid id');
