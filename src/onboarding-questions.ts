// Onboarding question definitions - used by both backend and frontend
export interface OnboardingQuestion {
  id: string;
  section: string;
  question: string;
  type: 'cards' | 'chips' | 'text' | 'number' | 'slider';
  options?: string[];
  placeholder?: string;
  multi?: boolean;
  min?: number;
  max?: number;
  prefix?: string;
}

export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  // SECTION 1: BUSINESS GOALS
  { id: 'business_goal', section: 'Business Goals', question: "Why are you starting this business? What's your ultimate goal?", type: 'cards', options: ["Side Income 💰 (Extra cash alongside my job)", "Profitable Brand 🚀 (Replace my income, work for myself)", "Multi-Million Empire 👑 ($1M+ revenue, build something massive)", "Passion Project ❤️ (Turn my hobby into income)", "Financial Freedom 🏖️ (Passive income, travel lifestyle)"] },
  { id: 'success_timeline', section: 'Business Goals', question: "What's your target timeline to hit your main goal?", type: 'cards', options: ["3-6 months (Aggressive growth)", "6-12 months (Steady build)", "1-2 years (Patient growth)", "2+ years (Long-term vision)"] },
  { id: 'time_commitment', section: 'Business Goals', question: "How much time can you dedicate weekly?", type: 'cards', options: ["5-10 hrs/week (Side hustle)", "10-20 hrs/week (Part-time)", "20-40 hrs/week (Serious effort)", "40+ hrs/week (Full-time)"] },
  
  // SECTION 2: STORE IDENTITY
  { id: 'store_name', section: 'Store Identity', question: "What's your store name?", type: 'text', placeholder: "e.g., Happy Puppy Supply" },
  { id: 'store_theme', section: 'Store Identity', question: "What Shopify theme style matches your brand?", type: 'cards', options: ["Minimal & Clean ✨ (Focus on products)", "Bold & Modern 🔥 (High impact visuals)", "Warm & Friendly 🏠 (Cozy, approachable)", "Luxury & Elegant 💎 (Premium feel)", "Playful & Fun 🎨 (Colorful, energetic)", "Rustic & Natural 🌿 (Organic, earthy)"] },
  
  // SECTION 3: PRODUCT STRATEGY
  { id: 'category', section: 'Product Strategy', question: "What category will you sell in?", type: 'cards', options: ["Pet Supplies 🐾", "Home & Garden 🏡", "Beauty & Personal Care 💄", "Electronics 🔌", "Fashion & Apparel 👕", "Fitness & Sports 🏋️", "Toys & Kids 🧸", "Health & Wellness 🧘", "Food & Beverage 🍔", "Arts & Crafts 🎨"] },
  { id: 'niche', section: 'Product Strategy', question: "What's your specific niche? (Be specific)", type: 'text', placeholder: "e.g., luxury dog accessories for small breeds" },
  { id: 'sourcing', section: 'Product Strategy', question: "How will you source products?", type: 'cards', options: ["Dropshipping (No inventory, supplier ships)", "Print-on-Demand (Custom designs, no inventory)", "Wholesale (Buy bulk, ship yourself)", "Hybrid (Mix of methods)", "Manufacturing (Create unique products)"] },
  { id: 'price_range', section: 'Product Strategy', question: "What price range will your main products be in?", type: 'cards', options: ["$10-30 (Impulse buy)", "$30-60 (Standard)", "$60-100 (Premium)", "$100-200 (High-ticket)", "$200+ (Luxury)"] },
  { id: 'target_margin', section: 'Product Strategy', question: "What's your target profit margin?", type: 'cards', options: ["20-30% (Competitive)", "30-40% (Healthy)", "40-50% (Strong)", "50%+ (Premium)"] },
  
  // SECTION 4: TARGET AUDIENCE
  { id: 'locations', section: 'Target Audience', question: "Which countries/regions will you target?", type: 'chips', options: ["United States 🇺🇸", "Canada 🇨🇦", "United Kingdom 🇬🇧", "Australia 🇦🇺", "Germany 🇩🇪", "France 🇫🇷", "Europe (All) 🇪🇺", "Mexico 🇲🇽", "Brazil 🇧🇷", "Southeast Asia 🌏"], multi: true },
  { id: 'age_range', section: 'Target Audience', question: "What age groups are your target customers?", type: 'chips', options: ["18-24 (Gen Z)", "25-34 (Millennials)", "35-44 (Gen X/Older Millennials)", "45-54 (Gen X)", "55-64 (Boomers II)", "65+ (Seniors)"], multi: true },
  { id: 'gender', section: 'Target Audience', question: "Which gender is your primary audience?", type: 'cards', options: ["All Genders", "Women (Primarily female)", "Men (Primarily male)"] },
  { id: 'income_level', section: 'Target Audience', question: "What's your target customer's income level?", type: 'cards', options: ["Budget-conscious (Price-sensitive)", "Middle income (Value-focused)", "Upper-middle (Quality-focused)", "Affluent (Premium buyers)", "All income levels"] },
  { id: 'interests', section: 'Target Audience', question: "What interests describe your ideal customer?", type: 'chips', options: ["Health & Fitness", "Fashion & Style", "Technology & Gadgets", "Home Decor & DIY", "Travel & Adventure", "Food & Cooking", "Gaming", "Parenting & Family", "Sustainability & Eco-friendly", "Luxury & Premium", "Outdoor Activities", "Arts & Creative"], multi: true },
  { id: 'life_stage', section: 'Target Audience', question: "What life stages describe your customers?", type: 'chips', options: ["Young professionals", "New parents", "Parents with young kids", "Parents with teens", "Empty nesters", "Retirees", "Students", "Homeowners", "Pet owners", "Fitness enthusiasts"], multi: true },
  
  // SECTION 5: BRAND & MARKETING
  { id: 'brand_personality', section: 'Brand & Marketing', question: "What's your brand's personality?", type: 'cards', options: ["Fun & Playful 🎉", "Luxury & Premium 💎", "Eco-Friendly & Natural 🌿", "Professional & Trustworthy 💼", "Trendy & Bold 🔥", "Cozy & Comforting 🏠", "Minimalist & Modern ✨"] },
  { id: 'price_positioning', section: 'Brand & Marketing', question: "How do you want customers to perceive your pricing?", type: 'cards', options: ["Budget-friendly (Best deals)", "Mid-range (Good value)", "Premium (Higher quality)", "Luxury (Exclusive, high-end)"] },
  { id: 'uvp', section: 'Brand & Marketing', question: "Why should customers buy from YOU instead of Amazon/big retailers?", type: 'text', placeholder: "e.g., curated selection, expert advice, exclusive products..." },
  { id: 'pain_points', section: 'Brand & Marketing', question: "What problems does your product solve for customers?", type: 'chips', options: ["Saves time", "Saves money", "Reduces stress", "Improves health", "Better quality than alternatives", "Hard to find elsewhere", "More convenient", "More sustainable/eco-friendly"], multi: true },
  
  // SECTION 6: MARKETING STRATEGY
  { id: 'marketing_budget', section: 'Marketing Strategy', question: "What's your monthly marketing budget to start?", type: 'number', placeholder: "e.g., 500", min: 0, max: 50000, prefix: "$" },
  { id: 'ad_platform', section: 'Marketing Strategy', question: "Where will you focus your ad spend initially?", type: 'cards', options: ["Meta/Facebook Ads (Best for most products)", "TikTok Ads (Great for Gen Z, viral potential)", "Google Ads (Search intent, high intent buyers)", "Pinterest Ads (Great for home, fashion, DIY)", "Influencer Marketing (Trusted recommendations)"] },
  { id: 'content_strategy', section: 'Marketing Strategy', question: "What content will you create?", type: 'chips', options: ["Product demos & tutorials", "Lifestyle photos/videos", "Educational content", "Behind-the-scenes", "User-generated content", "Customer reviews/testimonials", "Fun/entertaining content", "Influencer collaborations"], multi: true },
  { id: 'launch_strategy', section: 'Marketing Strategy', question: "How do you plan to launch?", type: 'cards', options: ["Soft launch (Start small, iterate)", "Grand opening (Big launch event)", "Pre-launch (Build email list first)", "Influencer launch (Partner with creators)", "Paid ads from day 1"] },
  
  // SECTION 7: OPERATIONS
  { id: 'support_level', section: 'Operations', question: "What level of customer support will you provide?", type: 'cards', options: ["Email only (Self-service)", "Email + Chat (Responsive)", "Full support (Chat, email, phone)", "VIP treatment (White-glove service)"] },
  { id: 'shipping_strategy', section: 'Operations', question: "What's your shipping approach?", type: 'cards', options: ["Free shipping on all orders", "Free shipping over $X", "Flat rate shipping", "Calculated shipping", "Fast/premium shipping options"] },
  { id: 'success_metrics', section: 'Operations', question: "How will you measure success? (Select top 3)", type: 'chips', options: ["Revenue growth", "Profit margins", "Customer acquisition cost", "Customer lifetime value", "Conversion rate", "Email list size", "Social media followers", "Customer satisfaction"], multi: true },
];

export const TOTAL_ONBOARDING_QUESTIONS = ONBOARDING_QUESTIONS.length;

// Get question by index (0-based)
export function getQuestion(index: number): OnboardingQuestion | undefined {
  return ONBOARDING_QUESTIONS[index];
}

// Get question by ID
export function getQuestionById(id: string): OnboardingQuestion | undefined {
  return ONBOARDING_QUESTIONS.find(q => q.id === id);
}

// Get all section names
export function getSections(): string[] {
  return [...new Set(ONBOARDING_QUESTIONS.map(q => q.section))];
}

// Get questions by section
export function getQuestionsBySection(section: string): OnboardingQuestion[] {
  return ONBOARDING_QUESTIONS.filter(q => q.section === section);
}
