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
  
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();
  
  // If strings are identical, return perfect match
  if (aLower === bLower) return 1.0;
  
  // If either string contains the other, give a high similarity score
  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    // If one is a substring of the other, give higher score based on length ratio
    const lengthRatio = Math.min(aLower.length, bLower.length) / Math.max(aLower.length, bLower.length);
    return 0.85 + (lengthRatio * 0.1); // Score between 0.85 and 0.95
  }
  
  // Special case for restaurant names - check if first word matches
  // This helps with cases like "Niros" matching "Niros Gyros"
  const aFirstWord = aLower.split(/\s+/)[0];
  const bFirstWord = bLower.split(/\s+/)[0];
  if (aFirstWord && bFirstWord && (aFirstWord === bFirstWord || aFirstWord.includes(bFirstWord) || bFirstWord.includes(aFirstWord))) {
    // First word matches, give a high score
    return 0.75;
  }
  
  // Check for word-level matches (especially useful for multi-word items)
  const aWords = aLower.split(/\s+/);
  const bWords = bLower.split(/\s+/);
  
  // Count matching words
  let matchingWords = 0;
  for (const aWord of aWords) {
    if (aWord.length <= 2) continue; // Skip very short words
    if (bWords.some(bWord => bWord.includes(aWord) || aWord.includes(bWord))) {
      matchingWords++;
    }
  }
  
  // If we have a good word-level match, boost the score
  const wordMatchRatio = matchingWords / Math.max(aWords.length, 1);
  if (wordMatchRatio > 0.4) { // Lower threshold from 0.5 to 0.4 for better matching
    return 0.7 + (wordMatchRatio * 0.2); // Score between 0.7 and 0.9
  }
  
  // Fall back to Levenshtein distance for other cases
  const distance = levenshteinDistance(aLower, bLower);
  const maxLength = Math.max(aLower.length, bLower.length);
  
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

/**
 * Normalize a string for better matching
 * This helps with common pronunciation variations
 */
export function normalizeString(input: string): string {
  if (!input) return '';
  
  let normalized = input.toLowerCase().trim();
  
  // Common substitutions for mispronunciations
  const substitutions: Record<string, string> = {
    'expresso': 'espresso',
    'expreso': 'espresso',
    'cappacino': 'cappuccino',
    'cappucino': 'cappuccino',
    'capuccino': 'cappuccino',
    'machiato': 'macchiato',
    'maciato': 'macchiato',
    'machato': 'macchiato',
    'mocha': 'mocha',
    'mocca': 'mocha',
    'moca': 'mocha',
    'caramel': 'caramel',
    'carmel': 'caramel',
    'vanilla': 'vanilla',
    'vanila': 'vanilla',
    'chocolate': 'chocolate',
    'choclate': 'chocolate',
    'chocalate': 'chocolate',
    'bagel': 'bagel',
    'bagle': 'bagel',
    'croissant': 'croissant',
    'crossant': 'croissant',
    'crossiant': 'croissant',
    'crosant': 'croissant',
    'sandwich': 'sandwich',
    'sandwitch': 'sandwich',
    'sandwhich': 'sandwich',
    'muffin': 'muffin',
    'mufin': 'muffin',
    'scone': 'scone',
    'scon': 'scone',
    'latte': 'latte',
    'late': 'latte',
    'americano': 'americano',
    'american': 'americano',
    'americono': 'americano',
    'frappuccino': 'frappuccino',
    'frapuccino': 'frappuccino',
    'frappucino': 'frappuccino',
    'frap': 'frappuccino',
    'frappe': 'frappuccino',
    'burger': 'burger',
    'buger': 'burger',
    'burgur': 'burger',
    'cheese': 'cheese',
    'chese': 'cheese',
    'pizza': 'pizza',
    'piza': 'pizza',
    'pepperoni': 'pepperoni',
    'peperoni': 'pepperoni',
    'margarita': 'margherita',
    'margherita': 'margherita',
    'hawaiian': 'hawaiian',
    'hawain': 'hawaiian',
    'hawian': 'hawaiian',
    'vegetarian': 'vegetarian',
    'veggie': 'vegetarian',
    'vegan': 'vegan',
    'vegitarian': 'vegetarian',
    'gluten': 'gluten',
    'glutin': 'gluten',
    'free': 'free',
    'small': 'small',
    'medium': 'medium',
    'large': 'large',
    'extra': 'extra',
    'xtra': 'extra',
    'shot': 'shot',
    'decaf': 'decaf',
    'decaff': 'decaf',
    'sugar': 'sugar',
    'suger': 'sugar',
    'sweetener': 'sweetener',
    'sweetner': 'sweetener',
    'milk': 'milk',
    'cream': 'cream',
    'creme': 'cream',
    'whipped': 'whipped',
    'whiped': 'whipped',
    'whip': 'whipped',
    'almond': 'almond',
    'almnd': 'almond',
    'soy': 'soy',
    'oat': 'oat',
    'coconut': 'coconut',
    'cocnut': 'coconut',
    'whole': 'whole',
    'skim': 'skim',
    'nonfat': 'nonfat',
    'non-fat': 'nonfat',
    'non fat': 'nonfat',
    'fat free': 'nonfat',
    'fatfree': 'nonfat',
    'fat-free': 'nonfat',
    'with': 'with',
    'without': 'without',
    'w/': 'with',
    'w/o': 'without',
    'no': 'no',
    'add': 'add',
    'quickie': 'the quickie',
    'quicky': 'the quickie',
    'quick': 'the quickie',
    'quik': 'the quickie',
    'des kwikis': 'the quickie',
    'please': '',
    'can i have': '',
    'i want': '',
    'i would like': '',
    'give me': '',
    'i\'ll take': '',
    'could i get': '',
    'may i have': '',
    'a ': ' ',
    'the ': ' '
  };
  
  // Apply substitutions
  for (const [incorrect, correct] of Object.entries(substitutions)) {
    // Replace at word boundaries to avoid partial word replacements
    const regex = new RegExp(`\\b${incorrect}\\b`, 'gi');
    normalized = normalized.replace(regex, correct);
  }
  
  // Remove filler words and extra spaces
  normalized = normalized
    .replace(/\b(um|uh|like|just|so|yeah|well|actually|basically)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  return normalized;
}

/**
 * Interface for a menu item
 */
export interface FuzzyMenuItem {
  id?: string;
  name: string;
  price?: number;
  [key: string]: any;
}

/**
 * Find a menu item by name using fuzzy matching
 * Returns the best matching menu item or null if no good match is found
 */
export function findMenuItemByName(
  itemName: string, 
  menuItems: FuzzyMenuItem[], 
  threshold = 0.5 // Lower threshold for better matching
): FuzzyMenuItem | null {
  if (!itemName || !menuItems || menuItems.length === 0) {
    return null;
  }
  
  // Normalize the query
  const normalizedQuery = normalizeString(itemName);
  
  // First try exact match (case insensitive)
  const exactMatch = menuItems.find(item => {
    const itemNameLower = item.name.toLowerCase();
    const normalizedItemName = normalizeString(item.name);
    
    return itemNameLower === normalizedQuery ||
           normalizedItemName === normalizedQuery ||
           // Handle cases where 'the' might be omitted or added
           (itemNameLower.startsWith('the ') && itemNameLower.substring(4) === normalizedQuery) ||
           (normalizedQuery.startsWith('the ') && normalizedQuery.substring(4) === itemNameLower) ||
           // Also check if the item name contains the query as a substring
           (itemNameLower.includes(normalizedQuery) && normalizedQuery.length > 3);
  });
  
  if (exactMatch) {
    console.log(`Exact match found for "${itemName}": "${exactMatch.name}"`);
    return exactMatch;
  }
  
  // Get all menu item names for fuzzy matching
  const menuItemNames = menuItems.map(item => item.name);
  
  // Try fuzzy matching
  const bestMatch = findBestMatch(normalizedQuery, menuItemNames);
  
  if (bestMatch && bestMatch.similarity >= threshold) {
    const matchedItem = menuItems.find(item => item.name === bestMatch.match);
    if (matchedItem) {
      console.log(`Fuzzy match found for "${itemName}": "${matchedItem.name}" (similarity: ${bestMatch.similarity.toFixed(2)})`);
      return matchedItem;
    }
  }
  
  // If no good match, find all potential matches
  const potentialMatches = findAllMatches(normalizedQuery, menuItemNames, threshold - 0.1);
  
  if (potentialMatches.length > 0) {
    console.log(`Potential matches for "${itemName}":`, 
      potentialMatches.map(m => `"${m.match}" (${m.similarity.toFixed(2)})`).join(', ')
    );
    
    // Use the best potential match
    const bestPotentialMatch = menuItems.find(item => item.name === potentialMatches[0].match);
    
    if (bestPotentialMatch) {
      console.log(`Using best potential match: "${itemName}" -> "${bestPotentialMatch.name}"`);
      return bestPotentialMatch;
    }
  }
  
  // No match found
  console.warn(`No menu item match found for: "${itemName}"`);
  return null;
}

/**
 * Verify a list of items against a menu and return validated items
 * This is useful for validating an entire order at once
 */
export function verifyOrderItems(
  requestedItems: Array<{name: string; quantity: number; [key: string]: any}>,
  menuItems: FuzzyMenuItem[],
  threshold = 0.5 // Lower threshold for better matching
): Array<{name: string; quantity: number; verified: boolean; suggestion?: string; [key: string]: any}> {
  return requestedItems.map(item => {
    const matchedItem = findMenuItemByName(item.name, menuItems, threshold);
    
    if (matchedItem) {
      return {
        ...item,
        name: matchedItem.name, // Use the correct name from the menu
        price: matchedItem.price || item.price,
        id: matchedItem.id || item.id,
        verified: true
      };
    } else {
      // If no match found, try to find a suggestion
      const normalizedQuery = normalizeString(item.name);
      const potentialMatches = findAllMatches(normalizedQuery, menuItems.map(mi => mi.name), threshold - 0.2);
      
      return {
        ...item,
        verified: false,
        suggestion: potentialMatches.length > 0 ? potentialMatches[0].match : undefined
      };
    }
  });
}
