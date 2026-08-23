// Onboarding question definitions - used by both backend and frontend
// Production-ready with comprehensive options matching Facebook/Instagram targeting

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
  // SECTION 1: BUSINESS FOUNDATION (3 questions)
  { 
    id: 'business_goal', 
    section: 'Business Foundation', 
    question: "What's your primary motivation for starting this business?", 
    type: 'cards', 
    options: [
      "Side Income 💰 - Extra cash alongside my 9-5 job",
      "Replace Income 🚀 - Quit my job, work for myself full-time", 
      "Build Empire 👑 - Scale to $1M+ revenue, create something massive",
      "Passion Project ❤️ - Turn my hobby into a profitable business",
      "Financial Freedom 🏖️ - Passive income to travel and live freely",
      "Legacy Building 🏛️ - Create a business I can pass to my children",
      "Impact Mission 🌍 - Make a difference while making money"
    ] 
  },
  { 
    id: 'success_timeline', 
    section: 'Business Foundation', 
    question: "What's your realistic timeline to achieve your main goal?", 
    type: 'cards', 
    options: [
      "3-6 months (Aggressive - I'm all in)",
      "6-12 months (Steady - Balanced approach)",
      "1-2 years (Patient - Building sustainably)",
      "2-3 years (Long-term - Slow and steady)",
      "3+ years (Legacy - Maximum patience)"
    ] 
  },
  { 
    id: 'time_commitment', 
    section: 'Business Foundation', 
    question: "How many hours per week can you realistically dedicate?", 
    type: 'cards', 
    options: [
      "5-10 hours/week - Side hustle mode",
      "10-20 hours/week - Part-time serious",
      "20-30 hours/week - Almost full-time", 
      "30-40 hours/week - Full-time effort",
      "40+ hours/week - All in, this is my focus"
    ] 
  },
  
  // SECTION 2: STORE IDENTITY (2 questions)
  { 
    id: 'store_name', 
    section: 'Store Identity', 
    question: "What will you name your store? (You can change this later)", 
    type: 'text', 
    placeholder: "e.g., Urban Paws, Glow Beauty Co., Peak Fitness Gear" 
  },
  { 
    id: 'store_theme', 
    section: 'Store Identity', 
    question: "What visual style matches your brand personality?", 
    type: 'cards', 
    options: [
      "Minimal & Clean ✨ - Let products speak for themselves",
      "Bold & Modern 🔥 - High-impact, eye-catching visuals",
      "Warm & Friendly 🏠 - Cozy, approachable, trustworthy", 
      "Luxury & Elegant 💎 - Premium, sophisticated, exclusive",
      "Playful & Fun 🎨 - Colorful, energetic, youthful",
      "Rustic & Natural 🌿 - Organic, earthy, handmade feel",
      "Tech & Futuristic 🚀 - Sleek, innovative, cutting-edge",
      "Vintage & Retro 📻 - Nostalgic, timeless, classic"
    ] 
  },
  
  // SECTION 3: PRODUCT STRATEGY (6 questions)
  { 
    id: 'category', 
    section: 'Product Strategy', 
    question: "Which industry/category will you focus on?", 
    type: 'cards', 
    options: [
      "Pet Supplies 🐾 - Food, toys, accessories, grooming",
      "Home & Garden 🏡 - Decor, furniture, kitchen, outdoor",
      "Beauty & Personal Care 💄 - Skincare, makeup, hair, wellness",
      "Fashion & Apparel 👕 - Clothing, shoes, accessories, jewelry",
      "Health & Wellness 🧘 - Supplements, fitness, mental health",
      "Electronics & Tech 🔌 - Gadgets, accessories, smart home",
      "Toys & Kids 🧸 - Toys, baby gear, educational products",
      "Sports & Outdoors 🏋️ - Fitness gear, camping, hiking, cycling",
      "Food & Beverage 🍔 - Specialty foods, drinks, supplements",
      "Arts & Crafts 🎨 - Supplies, DIY kits, handmade goods",
      "Automotive 🚗 - Car accessories, tools, maintenance",
      "Books & Media 📚 - Physical books, digital products, courses",
      "Office & Business 💼 - Supplies, organization, productivity",
      "Tools & Hardware 🔧 - DIY tools, home improvement, equipment"
    ] 
  },
  { 
    id: 'niche', 
    section: 'Product Strategy', 
    question: "Get specific: What's your exact niche within this category?", 
    type: 'text', 
    placeholder: "e.g., eco-friendly yoga mats for hot yoga, luxury dog beds for large breeds, organic skincare for acne-prone skin" 
  },
  { 
    id: 'sourcing', 
    section: 'Product Strategy', 
    question: "How will you source and fulfill products?", 
    type: 'cards', 
    options: [
      "Dropshipping - No inventory, supplier ships directly to customer",
      "Print-on-Demand - Custom designs printed when ordered, no inventory",
      "Wholesale/3PL - Buy in bulk, store in warehouse, they ship for me",
      "Self-Fulfilled - Buy in bulk, store at home/office, I ship",
      "Hybrid Model - Mix of methods depending on product type",
      "Manufacturing - Create unique products from scratch",
      "White Label - Put my brand on existing products",
      "Curated/Affiliate - Recommend products, earn commissions"
    ] 
  },
  { 
    id: 'price_range', 
    section: 'Product Strategy', 
    question: "What price range will your MAIN products be in?", 
    type: 'cards', 
    options: [
      "Under $25 - Impulse buy, low barrier to purchase",
      "$25-$50 - Affordable, accessible to most",
      "$50-$100 - Mid-range, quality perceived",
      "$100-$250 - Premium, higher margins",
      "$250-$500 - High-ticket, serious buyers",
      "$500+ - Luxury, exclusive market"
    ] 
  },
  { 
    id: 'target_margin', 
    section: 'Product Strategy', 
    question: "What profit margin are you targeting? (Revenue minus product cost)", 
    type: 'cards', 
    options: [
      "15-25% - Competitive pricing, volume play",
      "25-35% - Healthy, sustainable business",
      "35-45% - Strong margins, room for ads",
      "45-60% - Premium positioning, high profit",
      "60%+ - Luxury market, maximum margins"
    ] 
  },
  { 
    id: 'product_count', 
    section: 'Product Strategy', 
    question: "How many products do you plan to launch with?", 
    type: 'cards', 
    options: [
      "1-5 products - Focused, curated collection",
      "5-15 products - Small but complete catalog",
      "15-30 products - Medium catalog, variety",
      "30-50 products - Large catalog, many options",
      "50+ products - Extensive catalog, general store"
    ] 
  },
  
  // SECTION 4: TARGET AUDIENCE - GEOGRAPHY (1 question)
  { 
    id: 'locations', 
    section: 'Target Audience', 
    question: "Which countries/regions will you sell to? (Select all that apply)", 
    type: 'chips', 
    options: [
      "🇺🇸 United States",
      "🇨🇦 Canada", 
      "🇬🇧 United Kingdom",
      "🇦🇺 Australia",
      "🇩🇪 Germany",
      "🇫🇷 France",
      "🇪🇸 Spain",
      "🇮🇹 Italy",
      "🇳🇱 Netherlands",
      "🇧🇪 Belgium",
      "🇨🇭 Switzerland",
      "🇦🇹 Austria",
      "🇸🇪 Sweden",
      "🇳🇴 Norway",
      "🇩🇰 Denmark",
      "🇫🇮 Finland",
      "🇮🇪 Ireland",
      "🇵🇹 Portugal",
      "🇬🇷 Greece",
      "🇵🇱 Poland",
      "🇨🇿 Czech Republic",
      "🇭🇺 Hungary",
      "🇷🇴 Romania",
      "🇪🇺 All EU Countries",
      "🇲🇽 Mexico",
      "🇧🇷 Brazil",
      "🇦🇷 Argentina",
      "🇨🇱 Chile",
      "🇨🇴 Colombia",
      "🇵🇪 Peru",
      "🇿🇦 South Africa",
      "🇳🇬 Nigeria",
      "🇪🇬 Egypt",
      "🇰🇪 Kenya",
      "🇲🇦 Morocco",
      "🇯🇵 Japan",
      "🇰🇷 South Korea",
      "🇸🇬 Singapore",
      "🇭🇰 Hong Kong",
      "🇹🇼 Taiwan",
      "🇮🇳 India",
      "🇹🇭 Thailand",
      "🇲🇾 Malaysia",
      "🇮🇩 Indonesia",
      "🇵🇭 Philippines",
      "🇻🇳 Vietnam",
      "🇨🇳 China",
      "🇦🇪 UAE",
      "🇸🇦 Saudi Arabia",
      "🇮🇱 Israel",
      "🇹🇷 Turkey",
      "🇶🇦 Qatar",
      "🇰🇼 Kuwait",
      "🇳🇿 New Zealand",
      "🌏 Southeast Asia (All)",
      "🌍 Africa (All)",
      "🌎 Latin America (All)",
      "🌐 Global - Ship Everywhere"
    ],
    multi: true 
  },
  
  // SECTION 5: TARGET AUDIENCE - DEMOGRAPHICS (4 questions)
  { 
    id: 'age_range', 
    section: 'Target Audience', 
    question: "What age groups are your target customers? (Select all that apply)", 
    type: 'chips', 
    options: [
      "13-17 - Gen Z Teens",
      "18-24 - Gen Z Young Adults",
      "25-34 - Millennials",
      "35-44 - Gen X / Older Millennials",
      "45-54 - Gen X",
      "55-64 - Boomers II",
      "65-74 - Younger Seniors",
      "75+ - Older Seniors"
    ],
    multi: true 
  },
  { 
    id: 'gender', 
    section: 'Target Audience', 
    question: "Which gender is your primary audience?", 
    type: 'cards', 
    options: [
      "All Genders - Universal appeal",
      "Women (Primarily female) - 70%+ women",
      "Men (Primarily male) - 70%+ men",
      "Women-focused - Almost exclusively women",
      "Men-focused - Almost exclusively men",
      "Non-binary inclusive - Explicitly gender-neutral"
    ] 
  },
  { 
    id: 'income_level', 
    section: 'Target Audience', 
    question: "What's your target customer's income level?", 
    type: 'cards', 
    options: [
      "Budget-conscious - Price-sensitive, deal hunters",
      "Lower-middle income - Careful spending",
      "Middle income - Value-focused buyers",
      "Upper-middle income - Quality over price",
      "Affluent - Premium buyers, luxury acceptable",
      "High net worth - Price is not a concern",
      "All income levels - Accessible to everyone"
    ] 
  },
  { 
    id: 'life_stage', 
    section: 'Target Audience', 
    question: "What life stages describe your customers? (Select all that apply)", 
    type: 'chips', 
    options: [
      "Single / Dating",
      "In a relationship",
      "Engaged",
      "Married / Domestic partnership",
      "Newlyweds",
      "New parents (0-1 year)",
      "Parents with toddlers (1-3 years)",
      "Parents with preschoolers (3-5 years)",
      "Parents with school-age kids (5-12 years)",
      "Parents with teenagers (13-17 years)",
      "Empty nesters (kids left home)",
      "Grandparents",
      "Students (High school/College)",
      "Young professionals",
      "Mid-career professionals",
      "Pre-retirees",
      "Retirees",
      "Work from home",
      "Digital nomads",
      "Homeowners",
      "Renters",
      "Pet owners",
      "Car owners",
      "Home-based business owners"
    ],
    multi: true 
  },
  
  // SECTION 6: TARGET AUDIENCE - INTERESTS & BEHAVIORS (2 questions)
  { 
    id: 'interests', 
    section: 'Target Audience', 
    question: "What interests describe your ideal customer? (Select all that apply)", 
    type: 'chips', 
    options: [
      "Health & Fitness - Gym, running, yoga, nutrition",
      "Fashion & Style - Trends, personal style, accessories",
      "Technology & Gadgets - New tech, electronics, apps",
      "Home Decor & DIY - Interior design, crafts, renovations",
      "Travel & Adventure - Exploring, experiences, vacations",
      "Food & Cooking - Cooking, restaurants, food culture",
      "Gaming - Video games, board games, esports",
      "Parenting & Family - Kids, family activities, education",
      "Sustainability & Eco-friendly - Green living, conservation",
      "Luxury & Premium - High-end products, exclusivity",
      "Outdoor Activities - Hiking, camping, nature",
      "Arts & Creative - Music, painting, photography, writing",
      "Sports - Watching or playing sports",
      "Reading & Literature - Books, blogs, news",
      "Movies & TV - Streaming, cinema, entertainment",
      "Music - Listening, concerts, playing instruments",
      "Photography - Taking photos, cameras, editing",
      "Pets & Animals - Pet care, animal welfare",
      "Business & Entrepreneurship - Startups, investing",
      "Personal Development - Self-improvement, learning",
      "Social Causes - Activism, volunteering, politics",
      "Vegan / Plant-based - Vegan lifestyle, animal rights",
      "Minimalism - Simple living, decluttering",
      "Collecting - Hobbies, memorabilia, antiques",
      "Automotive - Cars, motorcycles, racing"
    ],
    multi: true 
  },
  { 
    id: 'pain_points', 
    section: 'Target Audience', 
    question: "What problems does your product solve for customers? (Select all that apply)", 
    type: 'chips', 
    options: [
      "Saves time - Convenience, efficiency",
      "Saves money - Cost reduction, deals",
      "Reduces stress - Peace of mind, less worry",
      "Improves health - Physical or mental wellness",
      "Better quality - Superior to alternatives",
      "Hard to find - Rare, unique, exclusive",
      "More convenient - Easier than current solution",
      "More sustainable - Eco-friendly, ethical",
      "Improves appearance - Look better, feel confident",
      "Solves a specific problem - Targeted solution",
      "Educational - Teaches something valuable",
      "Entertaining - Fun, enjoyment, leisure",
      "Social connection - Helps connect with others",
      "Status symbol - Signals success, taste",
      "Self-expression - Shows personality, identity",
      "Gift-worthy - Perfect for giving to others",
      "Makes life easier - Simplifies daily tasks",
      "Professional growth - Career advancement",
      "Relationship improvement - Better connections",
      "Safety & security - Protection, peace of mind"
    ],
    multi: true 
  },
  
  // SECTION 7: BRAND POSITIONING (3 questions)
  { 
    id: 'brand_personality', 
    section: 'Brand Positioning', 
    question: "What's your brand's core personality?", 
    type: 'cards', 
    options: [
      "Fun & Playful 🎉 - Lighthearted, humorous, energetic",
      "Luxury & Premium 💎 - Sophisticated, exclusive, refined",
      "Eco-Friendly & Natural 🌿 - Sustainable, organic, earth-conscious",
      "Professional & Trustworthy 💼 - Reliable, expert, credible",
      "Trendy & Bold 🔥 - Cutting-edge, daring, attention-grabbing",
      "Cozy & Comforting 🏠 - Warm, nurturing, homey",
      "Minimalist & Modern ✨ - Simple, clean, sophisticated",
      "Rugged & Adventurous ⛰️ - Tough, outdoorsy, adventurous",
      "Innovative & Futuristic 🚀 - Tech-forward, groundbreaking",
      "Authentic & Honest 🤝 - Transparent, real, genuine",
      "Quirky & Unique 🦄 - Stand out, different, memorable",
      "Sophisticated & Classy 🎩 - Timeless elegance, cultured"
    ] 
  },
  { 
    id: 'price_positioning', 
    section: 'Brand Positioning', 
    question: "How do you want customers to perceive your pricing?", 
    type: 'cards', 
    options: [
      "Budget-friendly - Best deals, value for money",
      "Affordable - Accessible to most people",
      "Mid-range - Good quality at fair price",
      "Premium - Higher quality, worth the extra cost",
      "Luxury - Exclusive, high-end, status symbol",
      "Dynamic - Range from budget to premium",
      "Transparent - Clear pricing, no hidden fees"
    ] 
  },
  { 
    id: 'uvp', 
    section: 'Brand Positioning', 
    question: "Why should customers buy from YOU instead of Amazon/big retailers?", 
    type: 'text', 
    placeholder: "e.g., curated selection by experts, personalized customer service, exclusive products not sold elsewhere, eco-friendly packaging, supports small makers..." 
  },
  
  // SECTION 8: MARKETING STRATEGY (5 questions)
  { 
    id: 'marketing_budget', 
    section: 'Marketing Strategy', 
    question: "What's your monthly marketing budget to start?", 
    type: 'number', 
    placeholder: "e.g., 500", 
    min: 0, 
    max: 100000, 
    prefix: "$" 
  },
  { 
    id: 'ad_platform', 
    section: 'Marketing Strategy', 
    question: "Which advertising platforms will you focus on? (Select your top 3)", 
    type: 'chips', 
    options: [
      "Meta/Facebook Ads - Best for most products, detailed targeting",
      "Instagram Ads - Visual products, lifestyle brands",
      "TikTok Ads - Gen Z, viral potential, trending products",
      "Google Ads - Search intent, high buyer intent",
      "YouTube Ads - Video content, tutorials, reviews",
      "Pinterest Ads - Home, fashion, DIY, female audience",
      "Snapchat Ads - Gen Z, younger millennials",
      "LinkedIn Ads - B2B, professional products",
      "Twitter/X Ads - Tech, news, male-skewed",
      "Reddit Ads - Niche communities, specific interests",
      "Amazon Ads - Already selling on Amazon",
      "Influencer Marketing - Partner with creators",
      "Affiliate Marketing - Others promote for commission",
      "Email Marketing - My own list (or building one)",
      "SEO/Content - Organic search traffic",
      "Organic Social - Free posts, community building"
    ],
    multi: true 
  },
  { 
    id: 'content_strategy', 
    section: 'Marketing Strategy', 
    question: "What content will you create to attract customers? (Select all that apply)", 
    type: 'chips', 
    options: [
      "Product demos & tutorials - Show how it works",
      "Lifestyle photos/videos - Product in use, aspirational",
      "Educational content - Tips, how-tos, guides",
      "Behind-the-scenes - Making products, packaging orders",
      "User-generated content - Customer photos, reviews",
      "Customer testimonials - Video reviews, success stories",
      "Fun/entertaining content - Memes, trends, personality",
      "Influencer collaborations - Partner posts, unboxings",
      "Before & after - Transformations, results",
      "Comparison content - Vs competitors, alternatives",
      "FAQ/Problem-solving - Address common concerns",
      "Storytelling - Brand story, founder journey",
      "Live streams - Real-time engagement, Q&A",
      "Polls/Interactive - Engage audience, get feedback",
      "Blog articles - SEO, in-depth content"
    ],
    multi: true 
  },
  { 
    id: 'launch_strategy', 
    section: 'Marketing Strategy', 
    question: "How do you plan to launch your store?", 
    type: 'cards', 
    options: [
      "Soft launch - Start small, get feedback, iterate quietly",
      "Grand opening - Big announcement, launch event, buzz",
      "Pre-launch - Build email list first, then launch",
      "Influencer launch - Partner with creators for debut",
      "Paid ads from day 1 - Aggressive advertising immediately",
      "Friends & family first - Test with people I know",
      "Beta testing - Invite-only, limited customers initially",
      "Kickstarter/Indiegogo - Crowdfund the launch"
    ] 
  },
  { 
    id: 'customer_acquisition', 
    section: 'Marketing Strategy', 
    question: "What's your primary customer acquisition strategy?", 
    type: 'cards', 
    options: [
      "Paid advertising - Facebook, Google, TikTok ads",
      "Social media organic - Build following, viral content",
      "Influencer partnerships - Pay creators to promote",
      "Content marketing - SEO, blog, YouTube",
      "Email marketing - Build list, nurture leads",
      "Referral program - Customers bring friends",
      "Affiliate program - Partners earn commissions",
      "Marketplaces - Amazon, Etsy, then to own store",
      "PR & Media - Press coverage, features",
      "Community building - Groups, forums, Discord",
      "Partnerships - Complementary brands",
      "Events & Pop-ups - In-person sales, markets"
    ] 
  },
  
  // SECTION 9: OPERATIONS & SUPPORT (3 questions)
  { 
    id: 'support_level', 
    section: 'Operations', 
    question: "What level of customer support will you provide?", 
    type: 'cards', 
    options: [
      "Self-service only - Help center, no direct support",
      "Email support - 24-48 hour response time",
      "Email + Chat - Faster responses, business hours",
      "Full support - Email, chat, phone during hours",
      "Premium support - Fast responses, extended hours",
      "White-glove - Dedicated support, personal attention"
    ] 
  },
  { 
    id: 'shipping_strategy', 
    section: 'Operations', 
    question: "What's your shipping and delivery approach?", 
    type: 'cards', 
    options: [
      "Free shipping on all orders - I absorb the cost",
      "Free shipping over $X threshold - Minimum order value",
      "Flat rate shipping - Simple, predictable cost",
      "Calculated shipping - Based on weight/destination",
      "Fast/premium options - Express delivery available",
      "Local delivery only - Specific regions, no international",
      "International shipping - Worldwide delivery",
      "Subscription shipping - Recurring deliveries"
    ] 
  },
  { 
    id: 'success_metrics', 
    section: 'Operations', 
    question: "How will you measure business success? (Select your top 3 priorities)", 
    type: 'chips', 
    options: [
      "Revenue growth - Total sales increasing",
      "Profit margins - Keeping costs low, profit high",
      "Customer acquisition cost (CAC) - Efficient marketing",
      "Customer lifetime value (LTV) - Repeat customers",
      "Conversion rate - Visitors who buy",
      "Average order value (AOV) - Higher spend per customer",
      "Email list size - Marketing reach",
      "Social media following - Brand awareness",
      "Customer satisfaction - Reviews, ratings, NPS",
      "Return rate - Low refunds/exchanges",
      "Repeat purchase rate - Customer loyalty",
      "Website traffic - More visitors",
      "Brand awareness - Recognition, mentions",
      "Work-life balance - Sustainable for me",
      "Impact metrics - Environmental/social good"
    ],
    multi: true 
  }
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

// Get questions by type
export function getQuestionsByType(type: OnboardingQuestion['type']): OnboardingQuestion[] {
  return ONBOARDING_QUESTIONS.filter(q => q.type === type);
}

// Get multi-select questions
export function getMultiSelectQuestions(): OnboardingQuestion[] {
  return ONBOARDING_QUESTIONS.filter(q => q.multi === true);
}

// Validate answers
export function validateAnswer(questionId: string, answer: any): boolean {
  const question = getQuestionById(questionId);
  if (!question) return false;
  
  if (question.type === 'text') {
    return typeof answer === 'string' && answer.length > 0;
  }
  
  if (question.type === 'number') {
    const num = Number(answer);
    if (isNaN(num)) return false;
    if (question.min !== undefined && num < question.min) return false;
    if (question.max !== undefined && num > question.max) return false;
    return true;
  }
  
  if (question.type === 'cards' || question.type === 'chips') {
    if (question.multi) {
      return Array.isArray(answer) && answer.length > 0;
    }
    return typeof answer === 'string' && (question.options?.includes(answer) || true);
  }
  
  return true;
}

// Calculate completion percentage
export function getCompletionPercentage(answeredCount: number): number {
  return Math.min(100, Math.round((answeredCount / TOTAL_ONBOARDING_QUESTIONS) * 100));
}

// Get next question based on current index
export function getNextQuestion(currentIndex: number): OnboardingQuestion | undefined {
  return getQuestion(currentIndex + 1);
}

// Get previous question based on current index  
export function getPreviousQuestion(currentIndex: number): OnboardingQuestion | undefined {
  return getQuestion(currentIndex - 1);
}

// Export default for convenience
export default ONBOARDING_QUESTIONS;
