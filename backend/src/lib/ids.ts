export const methodologyId = (version: string) => `methodology:${version}`;
export const moduleId = (version: string, code: string) => `${version}:${code}`;
export const categoryId = (version: string, externalId: string) => `${version}:${externalId}`;
export const cellTemplateId = (version: string, externalId: string) => `${version}:${externalId}`;
export const diagnosticCellId = (version: string, category: string, cell: string) => `${version}:${category}:${cell}`;
export const questionId = (version: string, externalId: string) => `${version}:${externalId}`;
export const profileQuestionId = (version: string, externalId: string) => `${version}:PROFILE:${externalId}`;
export const roleId = (version: string, externalId: string) => `${version}:ROLE:${externalId}`;
export const purposeId = (version: string, externalId: string) => `${version}:PURPOSE:${externalId}`;
