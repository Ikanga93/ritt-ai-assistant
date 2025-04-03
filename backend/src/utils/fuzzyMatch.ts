/**
 * Utility functions for fuzzy matching text
 */

/**
 * Calculate the Levenshtein distance between two strings
 * This measures how many single-character edits are needed to change one string into another
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize the matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity between two strings (0-1)
 * 1 means identical, 0 means completely different
 */
export function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  
  // If either string contains the other, give a high similarity score
  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    return 0.9;
  }
  
  const distance = levenshteinDistance(aLower, bLower);
  const maxLength = Math.max(a.length, b.length);
  
  if (maxLength === 0) return 1.0;
  return 1 - distance / maxLength;
}

/**
 * Find the best match for a query string from a list of options
 * Returns the best match and its similarity score
 */
export function findBestMatch(query: string, options: string[]): { match: string; similarity: number } | null {
  if (!options || options.length === 0 || !query) {
    return null;
  }
  
  let bestMatch = options[0];
  let bestSimilarity = stringSimilarity(query, bestMatch);
  
  for (let i = 1; i < options.length; i++) {
    const similarity = stringSimilarity(query, options[i]);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = options[i];
    }
  }
  
  return { match: bestMatch, similarity: bestSimilarity };
}

/**
 * Find all matches above a certain similarity threshold
 */
export function findAllMatches(query: string, options: string[], threshold = 0.7): Array<{ match: string; similarity: number }> {
  if (!options || options.length === 0 || !query) {
    return [];
  }
  
  return options
    .map(option => ({
      match: option,
      similarity: stringSimilarity(query, option)
    }))
    .filter(result => result.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);
}
