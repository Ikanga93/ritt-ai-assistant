/**
 * Test file to demonstrate enhanced fuzzy matching capabilities
 * This file shows examples of the improvements made to the fuzzy matching system
 */

import { 
  stringSimilarity, 
  findBestMatch, 
  findAllMatches, 
  normalizeString, 
  findMenuItemByName,
  verifyOrderItems,
  type FuzzyMenuItem 
} from './fuzzyMatch.js';

// Sample menu items for testing
const sampleMenuItems: FuzzyMenuItem[] = [
  { id: '1', name: 'Cappuccino', price: 4.50 },
  { id: '2', name: 'Espresso', price: 3.00 },
  { id: '3', name: 'Caramel Macchiato', price: 5.25 },
  { id: '4', name: 'Vanilla Latte', price: 4.75 },
  { id: '5', name: 'Iced Americano', price: 3.50 },
  { id: '6', name: 'Hot Chocolate', price: 3.75 },
  { id: '7', name: 'Frappuccino', price: 5.50 },
  { id: '8', name: 'The Quickie', price: 6.00 },
  { id: '9', name: 'Croissant Sandwich', price: 7.25 },
  { id: '10', name: 'Blueberry Muffin', price: 3.25 }
];

/**
 * Test enhanced fuzzy matching capabilities
 */
export function testEnhancedFuzzyMatching() {
  console.log('=== Enhanced Fuzzy Matching Test Results ===\n');

  // Test 1: Phonetic similarity
  console.log('1. Phonetic Similarity Tests:');
  const phoneticTests = [
    { query: 'cappacino', expected: 'Cappuccino' },
    { query: 'expresso', expected: 'Espresso' },
    { query: 'frapuccino', expected: 'Frappuccino' },
    { query: 'machiato', expected: 'Caramel Macchiato' }
  ];

  phoneticTests.forEach(test => {
    const result = findMenuItemByName(test.query, sampleMenuItems);
    console.log(`  "${test.query}" -> ${result ? `"${result.name}" ✓` : 'No match ✗'}`);
  });

  // Test 2: Abbreviation matching
  console.log('\n2. Abbreviation Matching Tests:');
  const abbreviationTests = [
    { query: 'cap', expected: 'Cappuccino' },
    { query: 'esp', expected: 'Espresso' },
    { query: 'frap', expected: 'Frappuccino' },
    { query: 'cm', expected: 'Caramel Macchiato' },
    { query: 'vl', expected: 'Vanilla Latte' }
  ];

  abbreviationTests.forEach(test => {
    const result = findMenuItemByName(test.query, sampleMenuItems);
    console.log(`  "${test.query}" -> ${result ? `"${result.name}" ✓` : 'No match ✗'}`);
  });

  // Test 3: Word order flexibility
  console.log('\n3. Word Order Flexibility Tests:');
  const wordOrderTests = [
    { query: 'macchiato caramel', expected: 'Caramel Macchiato' },
    { query: 'latte vanilla', expected: 'Vanilla Latte' },
    { query: 'americano iced', expected: 'Iced Americano' },
    { query: 'sandwich croissant', expected: 'Croissant Sandwich' }
  ];

  wordOrderTests.forEach(test => {
    const result = findMenuItemByName(test.query, sampleMenuItems);
    console.log(`  "${test.query}" -> ${result ? `"${result.name}" ✓` : 'No match ✗'}`);
  });

  // Test 4: Enhanced normalization
  console.log('\n4. Enhanced Normalization Tests:');
  const normalizationTests = [
    { query: 'can i have a cappuccino please', expected: 'Cappuccino' },
    { query: 'i would like the quickie', expected: 'The Quickie' },
    { query: 'give me a large vanilla latte', expected: 'Vanilla Latte' },
    { query: 'let me get a hot choc', expected: 'Hot Chocolate' }
  ];

  normalizationTests.forEach(test => {
    const result = findMenuItemByName(test.query, sampleMenuItems);
    console.log(`  "${test.query}" -> ${result ? `"${result.name}" ✓` : 'No match ✗'}`);
  });

  // Test 5: Dynamic threshold adjustment
  console.log('\n5. Dynamic Threshold Tests:');
  const thresholdTests = [
    { query: 'cap', description: 'Short query (should have higher threshold)' },
    { query: 'cappuccino', description: 'Medium query (standard threshold)' },
    { query: 'caramel macchiato vanilla', description: 'Long query (more lenient threshold)' }
  ];

  thresholdTests.forEach(test => {
    const result = findMenuItemByName(test.query, sampleMenuItems);
    console.log(`  "${test.query}" (${test.description}) -> ${result ? `"${result.name}" ✓` : 'No match ✗'}`);
  });

  // Test 6: Order verification with enhanced matching
  console.log('\n6. Order Verification Tests:');
  const orderItems = [
    { name: 'cappacino', quantity: 1 },
    { name: 'expresso shot', quantity: 2 },
    { name: 'vanilla late', quantity: 1 },
    { name: 'extra napkins', quantity: 5 },
    { name: 'frap', quantity: 1 }
  ];

  const verifiedOrder = verifyOrderItems(orderItems, sampleMenuItems);
  verifiedOrder.forEach(item => {
    const status = item.verified ? '✓ Verified' : 
                  item.isSpecialInstruction ? '⚠ Special Instruction' : 
                  item.suggestion ? `? Suggested: ${item.suggestion}` : '✗ No match';
    console.log(`  "${item.name}" -> ${status} (confidence: ${(item.confidence || 0).toFixed(2)})`);
  });

  console.log('\n=== Test Complete ===');
}

// Export for potential use in other files
export { sampleMenuItems }; 