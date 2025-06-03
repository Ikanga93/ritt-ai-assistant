/**
 * Utility functions for fuzzy matching text
 * Enhanced version with improved phonetic matching, abbreviation handling, and word order flexibility
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
 * Enhanced phonetic similarity check for sound-alike words
 */
function phoneticSimilarity(a: string, b: string): number {
  const phoneticPairs: Record<string, string[]> = {
    'f': ['ph', 'ff'],
    'k': ['c', 'ck', 'ch', 'q'],
    's': ['c', 'sc', 'ps'],
    'z': ['s'],
    'j': ['g', 'dge'],
    'i': ['y', 'ie'],
    'o': ['oa', 'ow'],
    'u': ['oo', 'ou'],
    'er': ['ur', 'ir', 'or'],
    'sh': ['tion', 'sion'],
    'n': ['kn', 'gn'],
    'w': ['wh']
  };

  let aPhonetic = a.toLowerCase();
  let bPhonetic = b.toLowerCase();

  // Apply phonetic transformations
  for (const [sound, variants] of Object.entries(phoneticPairs)) {
    for (const variant of variants) {
      const regex = new RegExp(variant, 'g');
      aPhonetic = aPhonetic.replace(regex, sound);
      bPhonetic = bPhonetic.replace(regex, sound);
    }
  }

  // Calculate similarity after phonetic normalization
  if (aPhonetic === bPhonetic) return 1.0;
  
  const distance = levenshteinDistance(aPhonetic, bPhonetic);
  const maxLength = Math.max(aPhonetic.length, bPhonetic.length);
  
  if (maxLength === 0) return 1.0;
  return 1 - distance / maxLength;
}

/**
 * Check for abbreviation matches
 */
function abbreviationMatch(query: string, target: string): number {
  const queryWords = query.toLowerCase().split(/\s+/);
  const targetWords = target.toLowerCase().split(/\s+/);
  
  // Check if query could be an abbreviation of target
  if (queryWords.length === 1 && targetWords.length > 1) {
    const queryChars = queryWords[0].split('');
    const targetInitials = targetWords.map(word => word[0]).join('');
    
    if (queryChars.join('') === targetInitials) {
      return 0.9; // High score for perfect abbreviation match
    }
    
    // Check partial abbreviation match
    let matchCount = 0;
    for (let i = 0; i < Math.min(queryChars.length, targetWords.length); i++) {
      if (queryChars[i] === targetWords[i][0]) {
        matchCount++;
      }
    }
    
    if (matchCount >= 2 && matchCount / queryChars.length >= 0.7) {
      return 0.7 + (matchCount / queryChars.length) * 0.2;
    }
  }
  
  return 0;
}

/**
 * Enhanced word order flexibility matching
 */
function wordOrderFlexibilityMatch(a: string, b: string): number {
  const aWords = a.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const bWords = b.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  
  if (aWords.length === 0 || bWords.length === 0) return 0;
  
  // Count matching words regardless of order
  let matchingWords = 0;
  const usedBWords = new Set<number>();
  
  for (const aWord of aWords) {
    for (let i = 0; i < bWords.length; i++) {
      if (usedBWords.has(i)) continue;
      
      const bWord = bWords[i];
      
      // Exact match
      if (aWord === bWord) {
        matchingWords++;
        usedBWords.add(i);
        break;
      }
      
      // Partial match (one word contains the other)
      if ((aWord.length > 3 && bWord.includes(aWord)) || 
          (bWord.length > 3 && aWord.includes(bWord))) {
        matchingWords += 0.8;
        usedBWords.add(i);
        break;
      }
      
      // Phonetic similarity
      const phoneticSim = phoneticSimilarity(aWord, bWord);
      if (phoneticSim > 0.8) {
        matchingWords += phoneticSim * 0.9;
        usedBWords.add(i);
        break;
      }
    }
  }
  
  // Calculate score based on word coverage
  const maxWords = Math.max(aWords.length, bWords.length);
  const minWords = Math.min(aWords.length, bWords.length);
  
  // Bonus for having all words from shorter string matched
  const coverage = matchingWords / maxWords;
  const completeness = matchingWords / minWords;
  
  return Math.min(0.95, (coverage * 0.6) + (completeness * 0.4));
}

/**
 * Calculate similarity between two strings (0-1) with enhanced matching
 * 1 means identical, 0 means completely different
 */
export function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();
  
  // If strings are identical, return perfect match
  if (aLower === bLower) return 1.0;
  
  // Check for abbreviation matches first
  const abbrevScore = abbreviationMatch(aLower, bLower) || abbreviationMatch(bLower, aLower);
  if (abbrevScore > 0.7) return abbrevScore;
  
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
  
  // Enhanced word order flexibility matching
  const wordOrderScore = wordOrderFlexibilityMatch(aLower, bLower);
  if (wordOrderScore > 0.6) return wordOrderScore;
  
  // Check for phonetic similarity
  const phoneticScore = phoneticSimilarity(aLower, bLower);
  if (phoneticScore > 0.8) return phoneticScore * 0.9;
  
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
  if (wordMatchRatio > 0.3) { // Lower threshold from 0.4 to 0.3 for better matching
    return 0.65 + (wordMatchRatio * 0.25); // Score between 0.65 and 0.9
  }
  
  // Fall back to Levenshtein distance for other cases
  const distance = levenshteinDistance(aLower, bLower);
  const maxLength = Math.max(aLower.length, bLower.length);
  
  if (maxLength === 0) return 1.0;
  return 1 - distance / maxLength;
}

/**
 * Dynamic threshold adjustment based on query characteristics
 */
function getDynamicThreshold(query: string, baseThreshold: number = 0.5): number {
  const queryLength = query.trim().length;
  const wordCount = query.trim().split(/\s+/).length;
  
  // Shorter queries need higher thresholds to avoid false positives
  if (queryLength <= 3) return Math.max(baseThreshold, 0.8);
  if (queryLength <= 5) return Math.max(baseThreshold, 0.7);
  
  // Single word queries can be more lenient
  if (wordCount === 1 && queryLength > 5) return Math.max(baseThreshold - 0.1, 0.4);
  
  // Multi-word queries can be more flexible
  if (wordCount > 2) return Math.max(baseThreshold - 0.15, 0.35);
  
  return baseThreshold;
}

/**
 * Find the best match for a query string from a list of options with enhanced matching
 * Returns the best match and its similarity score
 */
export function findBestMatch(query: string, options: string[]): { match: string; similarity: number; index?: number } | null {
  if (!options || options.length === 0 || !query) {
    return null;
  }
  
  let bestMatch = options[0];
  let bestSimilarity = stringSimilarity(query, bestMatch);
  let bestIndex = 0;
  
  for (let i = 1; i < options.length; i++) {
    const similarity = stringSimilarity(query, options[i]);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = options[i];
      bestIndex = i;
    }
  }
  
  // Use dynamic threshold
  const dynamicThreshold = getDynamicThreshold(query, 0.4);
  
  if (bestSimilarity >= dynamicThreshold) {
    return { match: bestMatch, similarity: bestSimilarity, index: bestIndex };
  }
  
  return null;
}

/**
 * Find all matches above a dynamically adjusted similarity threshold
 */
export function findAllMatches(query: string, options: string[], threshold?: number): Array<{ match: string; similarity: number }> {
  if (!options || options.length === 0 || !query) {
    return [];
  }
  
  // Use dynamic threshold if not provided
  const effectiveThreshold = threshold || getDynamicThreshold(query, 0.5);
  
  return options
    .map(option => ({
      match: option,
      similarity: stringSimilarity(query, option)
    }))
    .filter(result => result.similarity >= effectiveThreshold)
    .sort((a, b) => b.similarity - a.similarity);
}

/**
 * Enhanced normalize function with better abbreviation and phonetic handling
 * This helps with common pronunciation variations and abbreviations
 */
export function normalizeString(input: string): string {
  if (!input) return '';
  
  let normalized = input.toLowerCase().trim();
  
  // Enhanced substitutions for mispronunciations and abbreviations
  const substitutions: Record<string, string> = {
    // Coffee terms
    'expresso': 'espresso',
    'expreso': 'espresso',
    'esp': 'espresso',
    'cappacino': 'cappuccino',
    'cappucino': 'cappuccino',
    'capuccino': 'cappuccino',
    'cap': 'cappuccino',
    'capp': 'cappuccino',
    'machiato': 'macchiato',
    'maciato': 'macchiato',
    'machato': 'macchiato',
    'mach': 'macchiato',
    'mocha': 'mocha',
    'mocca': 'mocha',
    'moca': 'mocha',
    'caramel': 'caramel',
    'carmel': 'caramel',
    'car': 'caramel',
    'vanilla': 'vanilla',
    'vanila': 'vanilla',
    'van': 'vanilla',
    'chocolate': 'chocolate',
    'choclate': 'chocolate',
    'chocalate': 'chocolate',
    'choc': 'chocolate',
    'choco': 'chocolate',
    'latte': 'latte',
    'late': 'latte',
    'lat': 'latte',
    'americano': 'americano',
    'american': 'americano',
    'americono': 'americano',
    'amer': 'americano',
    'ameri': 'americano',
    'frappuccino': 'frappuccino',
    'frapuccino': 'frappuccino',
    'frappucino': 'frappuccino',
    'frap': 'frappuccino',
    'frappe': 'frappuccino',
    'frapp': 'frappuccino',
    
    // Food terms
    'bagel': 'bagel',
    'bagle': 'bagel',
    'croissant': 'croissant',
    'crossant': 'croissant',
    'crossiant': 'croissant',
    'crosant': 'croissant',
    'crois': 'croissant',
    'sandwich': 'sandwich',
    'sandwitch': 'sandwich',
    'sandwhich': 'sandwich',
    'sand': 'sandwich',
    'sandw': 'sandwich',
    'muffin': 'muffin',
    'mufin': 'muffin',
    'muff': 'muffin',
    'scone': 'scone',
    'scon': 'scone',
    'burger': 'burger',
    'buger': 'burger',
    'burgur': 'burger',
    'burg': 'burger',
    'cheese': 'cheese',
    'chese': 'cheese',
    'pizza': 'pizza',
    'piza': 'pizza',
    'pepperoni': 'pepperoni',
    'peperoni': 'pepperoni',
    'pep': 'pepperoni',
    'pepp': 'pepperoni',
    'margarita': 'margherita',
    'margherita': 'margherita',
    'marg': 'margherita',
    'hawaiian': 'hawaiian',
    'hawain': 'hawaiian',
    'hawian': 'hawaiian',
    'haw': 'hawaiian',
    
    // Size and modifier abbreviations
    'sm': 'small',
    'med': 'medium',
    'lg': 'large',
    'xl': 'extra large',
    'xxl': 'extra extra large',
    'reg': 'regular',
    'decaf': 'decaf',
    'decaff': 'decaf',
    'dec': 'decaf',
    'vegetarian': 'vegetarian',
    'veggie': 'vegetarian',
    'veg': 'vegetarian',
    'vegan': 'vegan',
    'vegitarian': 'vegetarian',
    'gluten': 'gluten',
    'glutin': 'gluten',
    'gf': 'gluten free',
    'sugar': 'sugar',
    'suger': 'sugar',
    'sweetener': 'sweetener',
    'sweetner': 'sweetener',
    'sweet': 'sweetener',
    
    // Milk alternatives and modifiers
    'milk': 'milk',
    'cream': 'cream',
    'creme': 'cream',
    'whipped': 'whipped',
    'whiped': 'whipped',
    'whip': 'whipped',
    'almond': 'almond',
    'almnd': 'almond',
    'alm': 'almond',
    'soy': 'soy',
    'oat': 'oat',
    'coconut': 'coconut',
    'cocnut': 'coconut',
    'coco': 'coconut',
    'whole': 'whole',
    'skim': 'skim',
    'nonfat': 'nonfat',
    'non-fat': 'nonfat',
    'non fat': 'nonfat',
    'fat free': 'nonfat',
    'fatfree': 'nonfat',
    'fat-free': 'nonfat',
    '2%': 'two percent',
    '1%': 'one percent',
    
    // Common modifiers and prepositions
    'with': 'with',
    'without': 'without',
    'w/': 'with',
    'w/o': 'without',
    'wo': 'without',
    'no': 'no',
    'add': 'add',
    'extra': 'extra',
    'xtra': 'extra',
    'shot': 'shot',
    'double': 'double',
    'triple': 'triple',
    'quad': 'quad',
    'half': 'half',
    'light': 'light',
    'heavy': 'heavy',
    'hot': 'hot',
    'cold': 'cold',
    'iced': 'iced',
    'frozen': 'frozen',
    
    // Menu-specific items (can be customized per restaurant)
    'quickie': 'the quickie',
    'quicky': 'the quickie',
    'quick': 'the quickie',
    'quik': 'the quickie',
    'des kwikis': 'the quickie',
    
    // Remove common filler phrases
    'please': '',
    'can i have': '',
    'i want': '',
    'i would like': '',
    'give me': '',
    'i\'ll take': '',
    'could i get': '',
    'may i have': '',
    'let me get': '',
    'let me have': '',
    'i need': '',
    'i\'d like': '',
    'a ': ' ',
    'the ': ' ',
    'an ': ' '
  };
  
  // Apply substitutions with word boundary matching for better accuracy
  for (const [incorrect, correct] of Object.entries(substitutions)) {
    if (correct === '') {
      // For phrases to be removed
      const regex = new RegExp(`\\b${incorrect.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      normalized = normalized.replace(regex, '');
    } else {
      // For substitutions
      const regex = new RegExp(`\\b${incorrect.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      normalized = normalized.replace(regex, correct);
    }
  }
  
  // Remove filler words and extra spaces
  normalized = normalized
    .replace(/\b(um|uh|like|just|so|yeah|well|actually|basically|you know|i mean)\b/gi, '')
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
 * Find a menu item by name using enhanced fuzzy matching
 * Returns the best matching menu item or null if no good match is found
 */
export function findMenuItemByName(
  itemName: string, 
  menuItems: FuzzyMenuItem[], 
  threshold?: number // Now optional, will use dynamic threshold if not provided
): FuzzyMenuItem | null {
  if (!itemName || !menuItems || menuItems.length === 0) {
    return null;
  }
  
  // Normalize the query
  const normalizedQuery = normalizeString(itemName);
  
  // Enhanced exact match checking
  const exactMatch = menuItems.find(item => {
    const itemNameLower = item.name.toLowerCase();
    const normalizedItemName = normalizeString(item.name);
    
    // Direct matches
    if (itemNameLower === normalizedQuery || normalizedItemName === normalizedQuery) {
      return true;
    }
    
    // Handle cases where 'the' might be omitted or added
    if ((itemNameLower.startsWith('the ') && itemNameLower.substring(4) === normalizedQuery) ||
        (normalizedQuery.startsWith('the ') && normalizedQuery.substring(4) === itemNameLower)) {
      return true;
    }
    
    // Check if the item name contains the query as a substantial substring
    if (normalizedQuery.length > 3 && itemNameLower.includes(normalizedQuery)) {
      return true;
    }
    
    // Check abbreviation matches
    const abbrevScore = abbreviationMatch(normalizedQuery, itemNameLower);
    if (abbrevScore > 0.8) {
      return true;
    }
    
    return false;
  });
  
  if (exactMatch) {
    console.log(`Exact match found for "${itemName}": "${exactMatch.name}"`);
    return exactMatch;
  }
  
  // Get all menu item names for fuzzy matching
  const menuItemNames = menuItems.map(item => item.name);
  
  // Use dynamic threshold if not provided
  const effectiveThreshold = threshold || getDynamicThreshold(normalizedQuery, 0.4);
  
  // Try enhanced fuzzy matching
  const bestMatch = findBestMatch(normalizedQuery, menuItemNames);
  
  if (bestMatch && bestMatch.similarity >= effectiveThreshold) {
    const matchedItem = menuItems.find(item => item.name === bestMatch.match);
    if (matchedItem) {
      console.log(`Fuzzy match found for "${itemName}": "${matchedItem.name}" (similarity: ${bestMatch.similarity.toFixed(2)}, threshold: ${effectiveThreshold.toFixed(2)})`);
      return matchedItem;
    }
  }
  
  // If no good match with standard threshold, try with a more lenient threshold for suggestions
  const lenientThreshold = Math.max(effectiveThreshold - 0.15, 0.25);
  const potentialMatches = findAllMatches(normalizedQuery, menuItemNames, lenientThreshold);
  
  if (potentialMatches.length > 0) {
    console.log(`Potential matches for "${itemName}" (threshold: ${lenientThreshold.toFixed(2)}):`, 
      potentialMatches.slice(0, 3).map(m => `"${m.match}" (${m.similarity.toFixed(2)})`).join(', ')
    );
    
    // Use the best potential match if it's significantly better than others
    const bestPotential = potentialMatches[0];
    const secondBest = potentialMatches[1];
    
    // If the best match is significantly better than the second best, use it
    if (!secondBest || (bestPotential.similarity - secondBest.similarity) > 0.1) {
      const bestPotentialMatch = menuItems.find(item => item.name === bestPotential.match);
      
      if (bestPotentialMatch && bestPotential.similarity >= lenientThreshold) {
        console.log(`Using best potential match: "${itemName}" -> "${bestPotentialMatch.name}" (confidence: ${bestPotential.similarity.toFixed(2)})`);
        return bestPotentialMatch;
      }
    }
  }
  
  // No match found
  console.warn(`No menu item match found for: "${itemName}" (normalized: "${normalizedQuery}", threshold: ${effectiveThreshold.toFixed(2)})`);
  return null;
}

/**
 * Verify a list of items against a menu and return validated items with enhanced matching
 * This is useful for validating an entire order at once
 */
export function verifyOrderItems(
  requestedItems: Array<{name: string; quantity: number; [key: string]: any}>,
  menuItems: FuzzyMenuItem[],
  threshold?: number // Now optional, will use dynamic threshold if not provided
): Array<{name: string; quantity: number; verified: boolean; isSpecialInstruction?: boolean; suggestion?: string; confidence?: number; [key: string]: any}> {
  // Enhanced list of keywords that suggest the item is a special instruction rather than a menu item
  const specialInstructionKeywords = [
    'napkin', 'silverware', 'utensil', 'fork', 'knife', 'spoon', 'straw', 'lid', 'cup holder',
    'condiment', 'sauce', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'ranch', 'bbq',
    'salt', 'pepper', 'sugar', 'cream', 'milk', 'honey', 'syrup',
    'please', 'extra', 'without', 'no ', 'add ', 'include', 'bring', 'need', 'want', 
    'put', 'give', 'provide', 'make sure', 'ensure', 'don\'t forget', 'remember', 
    'request', 'instruction', 'note', 'special', 'light', 'heavy', 'double', 'triple', 
    'hold', 'remove', 'minus', 'plus', 'on the side', 'separate', 'bag', 'to go',
    'for here', 'dine in', 'takeout', 'pickup', 'delivery', 'receipt', 'change'
  ];

  // Enhanced modification patterns
  const modificationPatterns = [
    /without\s+(\w+)/i,
    /no\s+(\w+)/i,
    /extra\s+(\w+)/i,
    /light\s+(\w+)/i,
    /heavy\s+(\w+)/i,
    /double\s+(\w+)/i,
    /triple\s+(\w+)/i,
    /hold\s+the\s+(\w+)/i,
    /remove\s+(\w+)/i,
    /minus\s+(\w+)/i,
    /plus\s+(\w+)/i,
    /add\s+(\w+)/i,
    /with\s+(\w+)/i,
    /on\s+the\s+side/i,
    /make\s+it\s+(\w+)/i
  ];

  return requestedItems.map(item => {
    // Check for modifications in the item name
    let baseItemName = item.name;
    let modifications: string[] = [];

    // Extract modifications from the item name
    modificationPatterns.forEach(pattern => {
      const matches = item.name.match(pattern);
      if (matches) {
        modifications.push(matches[0]);
        baseItemName = baseItemName.replace(matches[0], '').trim();
      }
    });

    // Check if this is likely a special instruction rather than a menu item
    const itemNameLower = baseItemName.toLowerCase();
    const isLikelySpecialInstruction = specialInstructionKeywords.some(keyword => 
      itemNameLower.includes(keyword.toLowerCase())
    );

    // Use dynamic threshold
    const effectiveThreshold = threshold || getDynamicThreshold(baseItemName, 0.4);

    // If it looks like a special instruction and not in the menu, mark it as such
    if (isLikelySpecialInstruction) {
      const matchedItem = findMenuItemByName(baseItemName, menuItems, effectiveThreshold + 0.2);
      
      if (!matchedItem) {
        console.log(`Identified "${item.name}" as a special instruction, not a menu item`);
        return {
          ...item,
          verified: false,
          isSpecialInstruction: true,
          price: 0,
          confidence: 0,
          specialInstructions: item.name
        };
      }
    }

    // Regular menu item verification with enhanced matching
    const matchedItem = findMenuItemByName(baseItemName, menuItems, effectiveThreshold);
    
    if (matchedItem) {
      // Calculate confidence based on similarity score
      const menuItemNames = menuItems.map(mi => mi.name);
      const bestMatch = findBestMatch(normalizeString(baseItemName), menuItemNames);
      const confidence = bestMatch ? bestMatch.similarity : 0.5;
      
      return {
        ...item,
        name: matchedItem.name,
        price: matchedItem.price || item.price,
        id: matchedItem.id || item.id,
        verified: true,
        isSpecialInstruction: false,
        confidence: confidence,
        specialInstructions: modifications.length > 0 ? modifications.join(', ') : undefined
      };
    } else {
      // If no match found, try to find suggestions with more lenient threshold
      const normalizedQuery = normalizeString(baseItemName);
      const lenientThreshold = Math.max(effectiveThreshold - 0.2, 0.2);
      const potentialMatches = findAllMatches(normalizedQuery, menuItems.map(mi => mi.name), lenientThreshold);
      
      let suggestion = undefined;
      let confidence = 0;
      
      if (potentialMatches.length > 0) {
        suggestion = potentialMatches[0].match;
        confidence = potentialMatches[0].similarity;
        
        console.log(`No exact match for "${item.name}", suggesting "${suggestion}" (confidence: ${confidence.toFixed(2)})`);
      }
      
      return {
        ...item,
        verified: false,
        isSpecialInstruction: false,
        suggestion: suggestion,
        confidence: confidence,
        specialInstructions: modifications.length > 0 ? modifications.join(', ') : undefined
      };
    }
  });
}
