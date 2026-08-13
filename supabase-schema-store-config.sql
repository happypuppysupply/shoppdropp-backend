-- Store Configuration Schema - Production Grade
-- Captures comprehensive business context for AI-driven dropshipping

-- Store Configurations Table
CREATE TABLE public.store_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Onboarding Progress
  onboarding_status text DEFAULT 'incomplete' 
    CHECK (onboarding_status IN ('incomplete', 'market_selected', 'audience_defined', 'brand_configured', 'products_selected', 'complete')),
  onboarding_step integer DEFAULT 1,
  onboarding_data jsonb DEFAULT '{}',
  
  -- Market & Niche (Production Grade)
  market_category text, -- e.g., "Pet Supplies", "Home & Garden", "Beauty & Personal Care"
  market_subcategory text, -- e.g., "Dog Accessories", "Kitchen Gadgets", "Skincare"
  market_niche text, -- Specific niche: "Luxury Dog Beds for Large Breeds"
  market_description text, -- AI-generated description based on selections
  market_size_estimate text, -- "Small", "Medium", "Large", "Mass Market"
  market_trends jsonb, -- Array of trend objects {trend: string, growth: string, source: string}
  
  -- Target Audience (Comprehensive Demographics)
  target_audience jsonb DEFAULT '{
    "primary": {
      "age_range": null,
      "gender": null,
      "income_level": null,
      "location": null,
      "education": null,
      "occupation": null,
      "marital_status": null,
      "has_children": null
    },
    "psychographics": {
      "interests": [],
      "hobbies": [],
      "values": [],
      "lifestyle": null,
      "personality_traits": []
    },
    "pain_points": [],
    "goals": [],
    "shopping_behavior": {
      "preferred_channels": [],
      "price_sensitivity": null,
      "purchase_frequency": null,
      "research_habits": null
    }
  }',
  
  -- Brand Configuration
  brand_name text,
  brand_voice text CHECK (brand_voice IN ('professional', 'friendly', 'playful', 'luxury', 'edgy', 'minimal', 'quirky', 'authoritative')),
  brand_tone_description text, -- AI-generated tone description
  brand_values text[], -- e.g., ['sustainability', 'quality', 'affordability']
  brand_story text, -- Origin story/mission
  brand_colors jsonb, -- {primary: '#xxx', secondary: '#xxx', accent: '#xxx'}
  brand_fonts jsonb, -- {heading: 'Font Name', body: 'Font Name'}
  
  -- Site Design Preferences
  site_style text CHECK (site_style IN ('modern', 'minimal', 'playful', 'luxury', 'rustic', 'tech', 'feminine', 'masculine', 'neutral')),
  site_layout_preference text CHECK (site_layout_preference IN ('grid', 'masonry', 'list', 'editorial')),
  site_features jsonb, -- Array of desired features
  competitor_sites text[], -- URLs of sites they like
  design_notes text,
  
  -- Product Strategy
  product_categories jsonb, -- [{name: string, priority: number, price_range: {min: number, max: number}}]
  product_count_target integer DEFAULT 20,
  price_strategy text CHECK (price_strategy IN ('budget', 'mid_range', 'premium', 'luxury', 'mixed')),
  avg_order_value_target decimal(10,2),
  profit_margin_target decimal(5,2),
  product_sourcing_preferences jsonb, -- {prefer_domestic: boolean, shipping_time_max: integer, quality_priority: string}
  
  -- Marketing Configuration
  marketing_budget_monthly decimal(10,2),
  marketing_channels jsonb, -- {meta_ads: boolean, google_ads: boolean, email: boolean, influencers: boolean}
  meta_ad_objective text CHECK (meta_ad_objective IN ('conversions', 'traffic', 'awareness', 'engagement')),
  target_cpa decimal(10,2), -- Target cost per acquisition
  target_roas decimal(5,2), -- Target return on ad spend
  
  -- Business Goals
  business_goals jsonb, -- [{goal: string, timeline: string, target: string}]
  launch_timeline text CHECK (launch_timeline IN ('asap', '1_week', '2_weeks', '1_month', 'flexible')),
  success_metrics jsonb, -- {revenue_target: number, profit_target: number, traffic_target: number}
  
  -- AI Context
  ai_context_summary text, -- AI-generated summary of all config for quick reference
  ai_suggestions jsonb, -- AI suggestions based on configuration
  
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  
  UNIQUE(store_id)
);

-- Store Configuration History (Track changes)
CREATE TABLE public.store_config_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_config_id uuid REFERENCES public.store_configs(id) ON DELETE CASCADE,
  changed_by text, -- 'user' or 'ai'
  field_changed text,
  old_value jsonb,
  new_value jsonb,
  change_reason text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Onboarding Prompts (AI-generated dynamic prompts)
CREATE TABLE public.onboarding_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_number integer NOT NULL,
  step_name text NOT NULL,
  prompt_template text NOT NULL, -- Template with placeholders
  input_type text CHECK (input_type IN ('single_select', 'multi_select', 'text', 'textarea', 'number', 'range', 'url', 'image_upload')),
  options_generation_query text, -- SQL or logic for generating dynamic options
  validation_rules jsonb, -- {required: boolean, min: number, max: number, pattern: string}
  ai_instructions text, -- Instructions for AI on how to generate/help with this step
  depends_on jsonb, -- [{field: string, value: any}] - conditional logic
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- RLS Policies
ALTER TABLE public.store_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own store configs"
  ON public.store_configs FOR ALL
  USING (auth.uid() = user_id);

ALTER TABLE public.store_config_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own config history"
  ON public.store_config_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.store_configs
      WHERE store_configs.id = store_config_history.store_config_id
      AND store_configs.user_id = auth.uid()
    )
  );

-- Triggers
CREATE TRIGGER store_configs_updated_at
  BEFORE UPDATE ON public.store_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_store_configs_store_id ON public.store_configs(store_id);
CREATE INDEX idx_store_configs_user_id ON public.store_configs(user_id);
CREATE INDEX idx_store_configs_onboarding_status ON public.store_configs(onboarding_status);
CREATE INDEX idx_store_config_history_config_id ON public.store_config_history(store_config_id);

-- Seed onboarding prompts
INSERT INTO public.onboarding_prompts (step_number, step_name, prompt_template, input_type, ai_instructions) VALUES
(1, 'market_category', 
 'What market category best describes the products you want to sell? Select a broad category and I''ll help you narrow down to a profitable niche.',
 'single_select',
 'Generate market categories based on trending dropshipping niches. Include: Pet Supplies, Home & Garden, Beauty & Personal Care, Electronics, Fitness & Wellness, Fashion & Accessories, Toys & Games, Kitchen & Dining, Office & Stationery, Outdoor & Sports'
),
(2, 'market_subcategory',
 'Great choice! Within {{market_category}}, what specific subcategory interests you most? I can suggest trending subcategories based on current market data.',
 'single_select',
 'Generate subcategories dynamically based on the selected market_category. Use market research data to suggest profitable subcategories with growth potential.'
),
(3, 'market_niche',
 'Let''s get specific. What niche within {{market_subcategory}} do you want to target? For example, instead of just "dog supplies," you might choose "eco-friendly toys for aggressive chewers." The more specific, the better we can target your ideal customer.',
 'text',
 'Help the user define a specific, profitable niche. Suggest examples based on their subcategory. Explain why specificity matters for dropshipping success.'
),
(4, 'target_audience_demographics',
 'Who is your ideal customer for {{market_niche}}? Let''s build a detailed customer profile so we can create marketing that resonates.',
 'multi_select',
 'Generate comprehensive demographic options based on the niche. Include age ranges, gender options, income levels, locations, education levels, occupations. Make suggestions relevant to the product category.'
),
(5, 'target_audience_psychographics',
 'What makes your ideal customer tick? Their interests, values, and lifestyle choices will help us craft the perfect brand message.',
 'multi_select',
 'Generate psychographic options: interests (hobbies, activities), values (sustainability, convenience, luxury, etc.), lifestyle choices, personality traits. Tailor to the niche.'
),
(6, 'pain_points',
 'What problems does your ideal customer face that {{market_niche}} solves? Understanding pain points is crucial for effective marketing copy.',
 'multi_select',
 'Generate likely pain points based on the niche and audience. Include both practical problems and emotional frustrations. Help the user identify 3-5 key pain points.'
),
(7, 'brand_voice',
 'How should your brand sound to your target audience? The voice should resonate with their values and aspirations.',
 'single_select',
 'Explain each brand voice option with examples. Suggest which voice might work best based on the niche and target audience demographics.'
),
(8, 'site_style',
 'What visual style should your Shopify store have? This should align with your brand voice and appeal to your target customer.',
 'single_select',
 'Describe each style with visual characteristics. Suggest styles that typically work well for the chosen niche and audience.'
),
(9, 'product_strategy',
 'How many products do you want to launch with? What''s your target price range and profit margin? This helps us curate the right products from suppliers.',
 'multi_select',
 'Guide the user through product count (recommend 20-50 for starters), price strategy (budget/premium), and profit margins (suggest 40-60% for dropshipping).'
),
(10, 'marketing_approach',
 'What''s your monthly marketing budget and primary channels? We''ll set up Meta Ads campaigns tailored to your audience and goals.',
 'multi_select',
 'Suggest realistic budgets for different growth speeds. Explain Meta Ads targeting options based on the audience profile. Set expectations for customer acquisition costs.'
),
(11, 'business_goals',
 'What are your goals for this store in the first 3 months? This helps us prioritize our AI workflow tasks.',
 'multi_select',
 'Help the user set SMART goals. Options: Launch store, First 10 sales, $1000 revenue, 1000 visitors, Break even, 50 products listed, First ad campaign live'
);
