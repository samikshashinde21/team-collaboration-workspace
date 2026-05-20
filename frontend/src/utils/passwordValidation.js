export const passwordRequirementText =
  "Password must be more than 6 characters and include uppercase, lowercase, and a number.";

export const isStrongPassword = (password = "") =>
  password.length > 6 &&
  /[A-Z]/.test(password) &&
  /[a-z]/.test(password) &&
  /\d/.test(password);
