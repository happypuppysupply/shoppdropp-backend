/**
 * Search Candidate Generator
 * Dynamically expands category/subcategory into multiple search candidates
 */

export interface SearchCandidate {
  term: string;
  type: 'hashtag' | 'keyword' | 'subreddit' | 'url';
  priority: number; // 1 = highest, 10 = lowest
  category: string;
}

interface CategoryExpansion {
  category: string;
  subcategories: string[];
  hashtags: string[];
  keywords: string[];
  subreddits: string[];
}

const CATEGORY_MAPPINGS: Record<string, CategoryExpansion> = {
  'pet': {
    category: 'pet',
    subcategories: ['dog', 'cat', 'puppy', 'kitten', 'bird', 'fish', 'small pet'],
    hashtags: [
      'petsupplies', 'petproducts', 'pettok', 'petfinds',
      'dogsupplies', 'dogproducts', 'dogtok', 'dogfinds',
      'catsupplies', 'catproducts', 'cattok', 'catfinds',
      'puppyproducts', 'kittenproducts', 'petgadgets',
      'pettoys', 'dogtoys', 'cattoys', 'petcare',
      'petgrooming', 'dogaccessories', 'cataccessories'
    ],
    keywords: [
      'pet supplies', 'pet products', 'pet accessories',
      'dog supplies', 'dog products', 'puppy products',
      'cat supplies', 'cat products', 'kitten products',
      'pet gadgets', 'pet toys', 'pet grooming',
      'pet care', 'pet essentials', 'dog accessories',
      'viral pet products', 'trending pet products',
      'tiktok made me buy it pet', 'amazon pet finds'
    ],
    subreddits: [
      'dogs', 'puppy101', 'cats', 'CatAdvice',
      'Pets', 'AskVet', 'Dogtraining', 'catpictures',
      'dogpictures', 'puppy', 'kittens', 'pettok',
      'BuyItForLife', 'deals'
    ]
  },
  'dog': {
    category: 'dog',
    subcategories: ['puppy', 'dog training', 'dog care'],
    hashtags: [
      'dogsupplies', 'dogproducts', 'dogtok', 'dogfinds',
      'puppyproducts', 'dogtoys', 'dogaccessories',
      'doggadgets', 'dogmom', 'dogdad', 'puppytok'
    ],
    keywords: [
      'dog supplies', 'dog products', 'puppy supplies',
      'dog accessories', 'dog toys', 'dog grooming',
      'dog care', 'puppy products', 'dog gadgets',
      'viral dog products', 'trending dog accessories'
    ],
    subreddits: [
      'dogs', 'puppy101', 'Dogtraining', 'dogpictures',
      'AskVet', 'puppy', 'dogcare'
    ]
  },
  'cat': {
    category: 'cat',
    subcategories: ['kitten', 'cat care', 'indoor cat'],
    hashtags: [
      'catsupplies', 'catproducts', 'cattok', 'catfinds',
      'kittenproducts', 'cattoys', 'cataccessories',
      'catmom', 'catdad', 'kittentok', 'catlife'
    ],
    keywords: [
      'cat supplies', 'cat products', 'kitten supplies',
      'cat accessories', 'cat toys', 'cat grooming',
      'cat care', 'kitten products', 'cat gadgets',
      'viral cat products', 'trending cat accessories'
    ],
    subreddits: [
      'cats', 'CatAdvice', 'catpictures', 'kittens',
      'CatTraining', 'indoorcats', 'catcare'
    ]
  },
  'home': {
    category: 'home',
    subcategories: ['kitchen', 'bedroom', 'living room', 'organization'],
    hashtags: [
      'homegadgets', 'homefinds', 'hometok', 'amazonfinds',
      'kitchengadgets', 'bedroomfinds', 'organizationtok',
      'homehacks', 'cleaningtok', 'homeautomation'
    ],
    keywords: [
      'home gadgets', 'home accessories', 'kitchen gadgets',
      'home organization', 'bedroom accessories', 'home decor',
      'home essentials', 'home must haves', 'home finds',
      'home improvement', 'home automation', 'smart home'
    ],
    subreddits: [
      'homeowners', 'HomeImprovement', 'CleaningTips',
      'organization', 'declutter', 'minimalism',
      'BuyItForLife', 'ThriftStoreHauls'
    ]
  },
  'kitchen': {
    category: 'kitchen',
    subcategories: ['cooking', 'baking', 'organization', 'tools'],
    hashtags: [
      'kitchengadgets', 'kitchenfinds', 'cookingtok',
      'bakingtok', 'kitchenhacks', 'amazonkitchen',
      'cookinggadgets', 'kitchenmusthaves'
    ],
    keywords: [
      'kitchen gadgets', 'cooking tools', 'kitchen accessories',
      'baking supplies', 'kitchen organization', 'cooking gadgets',
      'kitchen essentials', 'kitchen must haves', 'cooking accessories',
      'viral kitchen products', 'tiktok kitchen gadgets'
    ],
    subreddits: [
      'Cooking', 'recipes', 'KitchenConfidential',
      'AskCulinary', 'foodhacks', 'baking',
      'homeowners', 'organization'
    ]
  },
  'beauty': {
    category: 'beauty',
    subcategories: ['skincare', 'makeup', 'hair', 'nails'],
    hashtags: [
      'beautytok', 'skincaretok', 'makeuptok', 'hairtok',
      'beautyfinds', 'skincarefinds', 'makeupfinds',
      'glowup', 'beautyhacks', 'amazonbeauty'
    ],
    keywords: [
      'beauty products', 'skincare products', 'makeup products',
      'hair products', 'beauty gadgets', 'skincare tools',
      'beauty essentials', 'viral beauty products',
      'tiktok beauty', 'amazon beauty finds'
    ],
    subreddits: [
      'SkincareAddiction', 'MakeupAddiction', 'beauty',
      'HaircareScience', 'Nails', 'Skincare',
      'BuyItForLife'
    ]
  },
  'fashion': {
    category: 'fashion',
    subcategories: ['clothing', 'accessories', 'shoes', 'bags'],
    hashtags: [
      'fashiontok', 'ootd', 'fashionfinds', 'styletok',
      'clothingtok', 'outfit', 'fashionhacks', 'amazonfashion'
    ],
    keywords: [
      'fashion accessories', 'clothing accessories',
      'style products', 'fashion gadgets', 'outfit accessories',
      'fashion essentials', 'viral fashion products'
    ],
    subreddits: [
      'fashion', 'outfits', 'wardrobe', 'ThriftStoreHauls',
      'BuyItForLife', 'femalefashionadvice', 'malefashionadvice'
    ]
  },
  'electronics': {
    category: 'electronics',
    subcategories: ['gadgets', 'tech', 'accessories', 'smart home'],
    hashtags: [
      'techtok', 'gadgetstok', 'techfinds', 'gadgetfinds',
      'amazongadgets', 'techhacks', 'smartgadgets',
      'techmusthaves', 'coolgadgets'
    ],
    keywords: [
      'tech gadgets', 'electronic gadgets', 'smart gadgets',
      'tech accessories', 'cool gadgets', 'tech finds',
      'viral tech products', 'amazon tech gadgets'
    ],
    subreddits: [
      'gadgets', 'tech', 'BuyItForLife',
      'smartgadgets', 'personalfinance'
    ]
  },
  'sports': {
    category: 'sports',
    subcategories: ['fitness', 'outdoor', 'training', 'equipment'],
    hashtags: [
      'fitnesstok', 'gymtok', 'runningtok', 'sportstok',
      'workouttok', 'fitnessgadgets', 'gymaccessories',
      'runninggear', 'fitnesssupplies'
    ],
    keywords: [
      'fitness equipment', 'gym accessories', 'running gear',
      'sports equipment', 'fitness gadgets', 'workout accessories',
      'gym must haves', 'viral fitness products'
    ],
    subreddits: [
      'running', 'Fitness', 'homegym', 'Workout',
      'exercise', 'BuyItForLife', 'deals'
    ]
  },
  'toys': {
    category: 'toys',
    subcategories: ['games', 'educational', 'collectibles', 'kids'],
    hashtags: [
      'toytok', 'toyfinds', 'gametok', 'amazontoys',
      'toyhaul', 'toystore', 'collectibletok', 'kidstoys'
    ],
    keywords: [
      'toys', 'games', 'educational toys', 'kids toys',
      'collectibles', 'toy gadgets', 'viral toys',
      'amazon toy finds', 'trending toys'
    ],
    subreddits: [
      'toys', 'ActionFigures', 'Lego', 'boardgames',
      'puzzles', 'BuyItForLife', 'deals'
    ]
  },
  'general': {
    category: 'general',
    subcategories: ['products', 'accessories', 'gadgets'],
    hashtags: [
      'tiktokmademebuyit', 'amazonfinds', 'musthave',
      'viralproducts', 'tiktokfinds', 'amazonmusthaves',
      'productreview', 'unboxing', 'tiktokmadebuy'
    ],
    keywords: [
      'viral products', 'amazon finds', 'must have products',
      'trending products', 'tiktok products', 'amazon gadgets',
      'viral gadgets', 'amazon essentials', 'product finds'
    ],
    subreddits: [
      'BuyItForLife', 'ThriftStoreHauls', 'deals',
      'ProductReviews', 'AmazonReviews'
    ]
  }
};

export class SearchCandidateGenerator {
  private usedTerms: Set<string> = new Set();
  private termCounter: number = 0;
  private maxSearchCandidates: number = 50;

  constructor(private config: {
    maxSearchCandidates?: number;
  } = {}) {
    this.maxSearchCandidates = config.maxSearchCandidates || 50;
  }

  /**
   * Generate all search candidates for a category
   */
  generateCandidates(categoryInput: string, subcategoryInput?: string): {
    tiktok: SearchCandidate[];
    googleTrends: SearchCandidate[];
    reddit: SearchCandidate[];
    amazon: SearchCandidate[];
  } {
    const category = this.cleanCategory(categoryInput);
    const subcategory = subcategoryInput ? this.cleanCategory(subcategoryInput) : category;
    
    // Find best matching category expansion
    const expansion = this.findCategoryExpansion(category);
    
    // Generate candidates
    const tiktok = this.generateTikTokCandidates(expansion, category, subcategory);
    const googleTrends = this.generateGoogleTrendsCandidates(expansion, category, subcategory);
    const reddit = this.generateRedditCandidates(expansion, category, subcategory);
    const amazon = this.generateAmazonCandidates(expansion, category, subcategory);
    
    return { tiktok, googleTrends, reddit, amazon };
  }

  /**
   * Get next batch of candidates for a specific actor
   */
  getNextCandidates(
    candidates: SearchCandidate[], 
    batchSize: number,
    excludeUsed: boolean = true
  ): SearchCandidate[] {
    const available = excludeUsed 
      ? candidates.filter(c => !this.usedTerms.has(c.term))
      : candidates;
    
    // Sort by priority
    const sorted = available.sort((a, b) => a.priority - b.priority);
    
    // Take batch
    const batch = sorted.slice(0, batchSize);
    
    // Mark as used
    batch.forEach(c => this.usedTerms.add(c.term));
    
    return batch;
  }

  /**
   * Check if more candidates are available
   */
  hasMoreCandidates(candidates: SearchCandidate[]): boolean {
    return candidates.some(c => !this.usedTerms.has(c.term));
  }

  /**
   * Mark a search term as used
   */
  markUsed(term: string): void {
    this.usedTerms.add(term);
  }

  /**
   * Get count of remaining candidates
   */
  getRemainingCount(candidates: SearchCandidate[]): number {
    return candidates.filter(c => !this.usedTerms.has(c.term)).length;
  }

  private findCategoryExpansion(category: string): CategoryExpansion {
    const normalized = category.toLowerCase();
    
    // Direct match
    if (CATEGORY_MAPPINGS[normalized]) {
      return CATEGORY_MAPPINGS[normalized];
    }
    
    // Partial match
    for (const [key, expansion] of Object.entries(CATEGORY_MAPPINGS)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return expansion;
      }
    }
    
    // Extract root word and try matching
    const rootWords = normalized.split(/\s+/);
    for (const word of rootWords) {
      if (word.length > 2 && CATEGORY_MAPPINGS[word]) {
        return CATEGORY_MAPPINGS[word];
      }
    }
    
    // Fallback to general
    return CATEGORY_MAPPINGS['general'];
  }

  private generateTikTokCandidates(
    expansion: CategoryExpansion, 
    category: string,
    subcategory: string
  ): SearchCandidate[] {
    const candidates: SearchCandidate[] = [];
    
    // Primary hashtags from expansion
    expansion.hashtags.slice(0, 20).forEach((hashtag, i) => {
      candidates.push({
        term: this.sanitizeHashtag(hashtag),
        type: 'hashtag',
        priority: i < 10 ? 1 : 2,
        category: expansion.category
      });
    });
    
    // Category-specific combinations
    const combinations = [
      `${category}tok`,
      `${category}finds`,
      `${category}products`,
      `${category}supplies`,
      `${subcategory}tok`,
      `${subcategory}finds`,
      `tiktok${category}`,
      `amazon${category}`,
      `viral${category}`,
      `musthave${category}`,
    ];
    
    combinations.forEach((term, i) => {
      candidates.push({
        term: this.sanitizeHashtag(term),
        type: 'hashtag',
        priority: 3,
        category: expansion.category
      });
    });
    
    // Deduplicate
    return this.deduplicateCandidates(candidates).slice(0, this.maxSearchCandidates);
  }

  private generateGoogleTrendsCandidates(
    expansion: CategoryExpansion,
    category: string,
    subcategory: string
  ): SearchCandidate[] {
    const candidates: SearchCandidate[] = [];
    
    // Primary keywords
    expansion.keywords.slice(0, 15).forEach((keyword, i) => {
      candidates.push({
        term: keyword,
        type: 'keyword',
        priority: i < 5 ? 1 : 2,
        category: expansion.category
      });
    });
    
    // Buy intent variations
    expansion.keywords.slice(0, 10).forEach((keyword, i) => {
      candidates.push({
        term: `buy ${keyword}`,
        type: 'keyword',
        priority: 3,
        category: expansion.category
      });
    });
    
    // Category combinations
    const combos = [
      `best ${category}`,
      `top ${category}`,
      `${category} 2025`,
      `viral ${category}`,
      `amazon ${category}`,
      subcategory !== category ? subcategory : null,
    ].filter(Boolean) as string[];
    
    combos.forEach((term, i) => {
      candidates.push({
        term,
        type: 'keyword',
        priority: 4,
        category: expansion.category
      });
    });
    
    return this.deduplicateCandidates(candidates).slice(0, 25);
  }

  private generateRedditCandidates(
    expansion: CategoryExpansion,
    category: string,
    subcategory: string
  ): SearchCandidate[] {
    const candidates: SearchCandidate[] = [];
    
    // Subreddit + search term combinations
    expansion.subreddits.slice(0, 10).forEach((subreddit, i) => {
      // Add subreddit itself
      candidates.push({
        term: subreddit,
        type: 'subreddit',
        priority: i < 5 ? 1 : 2,
        category: expansion.category
      });
    });
    
    return this.deduplicateCandidates(candidates).slice(0, 15);
  }

  private generateAmazonCandidates(
    expansion: CategoryExpansion,
    category: string,
    subcategory: string
  ): SearchCandidate[] {
    const candidates: SearchCandidate[] = [];
    
    // Build Amazon search URLs
    const searchTerms = [
      ...expansion.keywords.slice(0, 15),
      category,
      subcategory !== category ? subcategory : null,
      `${category} accessories`,
      `${category} gadgets`,
      `${category} supplies`,
    ].filter((t): t is string => Boolean(t));
    
    searchTerms.forEach((term, i) => {
      const encoded = encodeURIComponent(term);
      candidates.push({
        term: `https://www.amazon.com/s?k=${encoded}&ref=nb_sb_noss`,
        type: 'url',
        priority: i < 5 ? 1 : 2,
        category: expansion.category
      });
    });
    
    return this.deduplicateCandidates(candidates).slice(0, 20);
  }

  private cleanCategory(input: any): string {
    // Handle arrays - take first element
    let str = Array.isArray(input) ? input[0] : input;
    // Convert to string
    str = String(str || "");
    return str
      .toLowerCase()
      // Remove all emoji (comprehensive regex)
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{238C}\u{2B06}\u{2B07}\u{2B05}\u{27A1}\u{2194}-\u{2199}\u{21A9}-\u{21AA}\u{2934}-\u{2935}\u{25AA}-\u{25AB}\u{25FB}-\u{25FE}\u{25FD}-\u{25FE}\u{2B50}\u{2B55}\u{2328}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{24C2}\u{23EE}\u{23ED}\u{23EF}\u{267E}\u{267F}\u{2692}-\u{2697}\u{2699}\u{269B}-\u{269C}\u{26A0}-\u{26A1}\u{26AA}-\u{26AB}\u{26B0}-\u{26B1}\u{26BD}-\u{26BE}\u{26C4}-\u{26C5}\u{26CE}\u{26D1}\u{26D3}-\u{26D4}\u{26E9}-\u{26EA}\u{26F0}-\u{26F5}\u{26F7}-\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{271D}\u{2721}\u{2728}\u{2733}-\u{2734}\u{2744}\u{2747}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2795}-\u{2797}\u{27A1}\u{27B0}\u{27BF}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{2B50}\u{2B55}]/gu, '')
      // Split on dash/em-dash/en-dash and take first part (before description)
      .split(/\s*[-–—]\s*/)[0]
      .trim()
      .replace(/\s+/g, ' ');
  }

  private sanitizeHashtag(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 30);
  }

  private deduplicateCandidates(candidates: SearchCandidate[]): SearchCandidate[] {
    const seen = new Set<string>();
    return candidates.filter(c => {
      if (seen.has(c.term)) return false;
      seen.add(c.term);
      return true;
    });
  }
}

export default SearchCandidateGenerator;