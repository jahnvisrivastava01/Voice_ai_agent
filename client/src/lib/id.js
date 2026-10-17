let n = 0;
export const uid = () => `${Date.now().toString(36)}-${(n++).toString(36)}`;
