const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/**
 * Server-side guard for admin image uploads (banners, magazine pages).
 * Returns a Polish error string if the file fails validation, or null if it's fine.
 */
export function validateImageFile(file: File, maxBytes: number): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return `Niedozwolony typ pliku: ${file.type || 'nieznany'}. Dozwolone są tylko obrazy (PNG, JPEG, WEBP, GIF).`;
  }
  if (file.size > maxBytes) {
    return `Plik "${file.name}" jest zbyt duży (max ${Math.floor(maxBytes / (1024 * 1024))}MB).`;
  }
  return null;
}
