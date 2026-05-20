export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normalizeEmail = (email = "") => email.trim().toLowerCase();

export const isValidEmail = (email = "") => emailPattern.test(normalizeEmail(email));

export const emailValidationMessage = "Enter a valid email address.";
