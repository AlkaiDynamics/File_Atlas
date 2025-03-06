const Joi = require('joi');

// Schema for individual file/directory node
const nodeSchema = Joi.object({
  id: Joi.string().pattern(/^\d+(\.\d+)*$/).required().description('Classification ID (e.g., "1.0", "2.1", "3.1.1")'),
  name: Joi.string().required(),
  type: Joi.string().valid('root', 'folder', 'file').required(),
  subtype: Joi.string().when('type', {
    is: 'folder',
    then: Joi.string().valid('standard', 'protected').required(),
    otherwise: Joi.when('type', {
      is: 'file',
      then: Joi.string().required(),
      otherwise: Joi.forbidden()
    })
  }),
  path: Joi.string().required(),
  children: Joi.when('type', {
    is: Joi.valid('root', 'folder'),
    then: Joi.array().items(Joi.link('#nodeSchema')),
    otherwise: Joi.forbidden()
  }),
  metadata: Joi.object({
    size: Joi.string().when('type', {
      is: 'file',
      then: Joi.required(),
      otherwise: Joi.forbidden()
    }),
    modified: Joi.string().isoDate().required(),
    permissions: Joi.string().required(),
    owner: Joi.string().required(),
    hidden: Joi.boolean().required(),
    system: Joi.boolean().required()
  }).required()
}).id('nodeSchema');

// Schema for file system data response
const fileSystemDataSchema = Joi.object({
  root: nodeSchema.required(),
  timestamp: Joi.date().iso().required(),
  totalFiles: Joi.number().integer().min(0).required(),
  totalDirectories: Joi.number().integer().min(0).required(),
  totalSize: Joi.number().min(0).required()
});

module.exports = {
  nodeSchema,
  fileSystemDataSchema,
  validateNode: (data) => nodeSchema.validate(data),
  validateFileSystemData: (data) => fileSystemDataSchema.validate(data)
};