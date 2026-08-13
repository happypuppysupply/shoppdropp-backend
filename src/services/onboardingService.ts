import { db, supabase } from '../db/supabase';
import axios from 'axios';

export interface OnboardingStep {
  stepNumber: number;
  stepName: string;
  prompt: string;
  inputType: string;
  options?: any[];
  validation?: any;
  dependsOn?: any[];
}

export interface StoreConfigData {
  marketCategory?: string;
  marketSubcategory?: string;
  marketNiche?: string;
  targetAudience?: any;
  painPoints?: string[];
  brandVoice?: string;
  siteStyle?: string;
  productStrategy?: any;
  marketingApproach?: any;
  businessGoals?: any[];
}

export class OnboardingService {
  private openRouterApiKey: string;

  constructor(apiKey?: string) {
    this.openRouterApiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
  }

  // Get current onboarding state for a store
  async getOnboardingState(storeId: string, userId: string) {
    const { data: config, error } = await supabase
      .from('store_configs')
      .select('*')
      .eq('store_id', storeId)
      .single();

    if (error || !config) {
      // Create initial config
      const { data: newConfig, error: createError } = await supabase
        .from('store_configs')
        .insert({
          store_id: storeId,
          user_id: userId,
          onboarding_status: 'incomplete',
          onboarding_step: 1,
        })
        .select()
        .single();

      if (createError) throw createError;
      return { config: newConfig, isComplete: false };
    }

    return {
      config,
      isComplete: config.onboarding_status === 'complete',
    };
  }

  // Generate AI-driven onboarding prompt for current step
  async generateStepPrompt(
    storeId: string,
    userId: string,
    currentStep: number,
    existingData: StoreConfigData
  ): Promise<OnboardingStep> {
    // Get base prompt template from database
    const { data: promptTemplate } = await supabase
      .from('onboarding_prompts')
      .select('*')
      .eq('step_number', currentStep)
      .single();

    if (!promptTemplate) {
      throw new Error(`No prompt template found for step ${currentStep}`);
    }

    // Generate dynamic options using AI based on previous selections
    const options = await this.generateDynamicOptions(
      currentStep,
      promptTemplate,
      existingData
    );

    // Personalize prompt with user's previous selections
    let personalizedPrompt = promptTemplate.prompt_template;
    if (existingData.marketCategory) {
      personalizedPrompt = personalizedPrompt.replace(
        /{{market_category}}/g,
        existingData.marketCategory
      );
    }
    if (existingData.marketSubcategory) {
      personalizedPrompt = personalizedPrompt.replace(
        /{{market_subcategory}}/g,
        existingData.marketSubcategory
      );
    }
    if (existingData.marketNiche) {
      personalizedPrompt = personalizedPrompt.replace(
        /{{market_niche}}/g,
        existingData.marketNiche
      );
    }

    return {
      stepNumber: currentStep,
      stepName: promptTemplate.step_name,
      prompt: personalizedPrompt,
      inputType: promptTemplate.input_type,
      options,
      validation: promptTemplate.validation_rules,
      dependsOn: promptTemplate.depends_on,
    };
  }

  // Generate dynamic options based on context
  private async generateDynamicOptions(
    stepNumber: number,
    template: any,
    existingData: StoreConfigData
  ): Promise<any[]> {
    // Static options for some steps
    if (stepNumber === 1) {
      return [
        { id: 'pet_supplies', name: 'Pet Supplies', description: 'Food, toys, accessories for pets', trending: true },
        { id: 'home_garden', name: 'Home & Garden', description: 'Decor, furniture, gardening', trending: true },
        { id: 'beauty_care', name: 'Beauty & Personal Care', description: 'Skincare, cosmetics, grooming', trending: true },
        { id: 'electronics', name: 'Electronics & Gadgets', description: 'Tech accessories, smart devices', trending: false },
        { id: 'fitness_wellness', name: 'Fitness & Wellness', description: 'Exercise gear, supplements, health', trending: true },
        { id: 'fashion_accessories', name: 'Fashion & Accessories', description: 'Clothing, jewelry, bags', trending: false },
        { id: 'toys_games', name: 'Toys & Games', description: 'Kids toys, games, hobbies', trending: false },
        { id: 'kitchen_dining', name: 'Kitchen & Dining', description: 'Cookware, gadgets, appliances', trending: true },
        { id: 'office_stationery', name: 'Office & Stationery', description: 'Supplies, organizers, decor', trending: false },
        { id: 'outdoor_sports', name: 'Outdoor & Sports', description: 'Camping, sports gear, activities', trending: true },
      ];
    }

    // Dynamic subcategories based on selected category
    if (stepNumber === 2 && existingData.marketCategory) {
      return this.getSubcategoriesForCategory(existingData.marketCategory);
    }

    // Dynamic demographics based on niche
    if (stepNumber === 4) {
      return this.generateDemographicsOptions(existingData);
    }

    // Dynamic pain points based on niche
    if (stepNumber === 6) {
      return this.generatePainPoints(existingData);
    }

    // Brand voice options
    if (stepNumber === 7) {
      return [
        { id: 'professional', name: 'Professional', description: 'Expert, trustworthy, authoritative', example: 'We deliver proven solutions for your needs.' },
        { id: 'friendly', name: 'Friendly', description: 'Warm, approachable, conversational', example: 'Hey there! We''re so glad you stopped by!' },
        { id: 'playful', name: 'Playful', description: 'Fun, energetic, humorous', example: 'Ready to level up? Let''s make shopping fun again!' },
        { id: 'luxury', name: 'Luxury', description: 'Sophisticated, exclusive, elegant', example: 'Experience the epitome of refined quality.' },
        { id: 'edgy', name: 'Edgy', description: 'Bold, daring, provocative', example: 'Break the rules. Stand out from the crowd.' },
        { id: 'minimal', name: 'Minimal', description: 'Clean, simple, direct', example: 'Quality products. No compromises.' },
      ];
    }

    // Site style options
    if (stepNumber === 8) {
      return [
        { id: 'modern', name: 'Modern', description: 'Clean lines, contemporary, sleek' },
        { id: 'minimal', name: 'Minimal', description: 'Simple, whitespace-focused, elegant' },
        { id: 'playful', name: 'Playful', description: 'Colorful, fun, approachable' },
        { id: 'luxury', name: 'Luxury', description: 'Rich, sophisticated, high-end' },
        { id: 'rustic', name: 'Rustic', description: 'Natural, warm, handcrafted feel' },
        { id: 'tech', name: 'Tech', description: 'Futuristic, innovative, cutting-edge' },
      ];
    }

    // Use AI for complex dynamic generation
    if (this.openRouterApiKey && stepNumber > 2) {
      try {
        return await this.generateAIOptions(stepNumber, existingData);
      } catch (e) {
        console.error('AI option generation failed, using defaults:', e);
      }
    }

    return [];
  }

  // Get subcategories based on selected category
  private getSubcategoriesForCategory(category: string): any[] {
    const subcategories: Record<string, any[]> = {
      pet_supplies: [
        { id: 'dog_accessories', name: 'Dog Accessories', description: 'Collars, leashes, beds, toys', trending: true },
        { id: 'cat_supplies', name: 'Cat Supplies', description: 'Litter boxes, scratchers, toys', trending: true },
        { id: 'pet_grooming', name: 'Pet Grooming', description: 'Brushes, shampoos, clippers', trending: false },
        { id: 'pet_furniture', name: 'Pet Furniture', description: 'Beds, houses, carriers', trending: true },
        { id: 'pet_feeding', name: 'Feeding Supplies', description: 'Bowls, feeders, storage', trending: false },
        { id: 'pet_training', name: 'Training Aids', description: 'Clickers, pads, deterrents', trending: false },
        { id: 'pet_health', name: 'Health & Wellness', description: 'Supplements, dental care', trending: true },
      ],
      home_garden: [
        { id: 'kitchen_gadgets', name: 'Kitchen Gadgets', description: 'Tools, organizers, accessories', trending: true },
        { id: 'home_decor', name: 'Home Decor', description: 'Wall art, vases, candles', trending: true },
        { id: 'storage_org', name: 'Storage & Organization', description: 'Bins, shelves, organizers', trending: true },
        { id: 'garden_tools', name: 'Garden Tools', description: 'Planters, tools, accessories', trending: false },
        { id: 'bathroom', name: 'Bathroom Accessories', description: 'Organizers, decor, textiles', trending: false },
        { id: 'bedding', name: 'Bedding & Linens', description: 'Sheets, pillows, blankets', trending: true },
      ],
      beauty_care: [
        { id: 'skincare', name: 'Skincare', description: 'Cleansers, serums, moisturizers', trending: true },
        { id: 'hair_care', name: 'Hair Care', description: 'Tools, treatments, accessories', trending: true },
        { id: 'makeup_tools', name: 'Makeup Tools', description: 'Brushes, sponges, organizers', trending: true },
        { id: 'bath_body', name: 'Bath & Body', description: 'Soaps, scrubs, bath accessories', trending: false },
        { id: 'oral_care', name: 'Oral Care', description: 'Electric brushes, flossers, whitening', trending: true },
        { id: 'mens_grooming', name: 'Men''s Grooming', description: 'Beard care, skincare, tools', trending: true },
      ],
      fitness_wellness: [
        { id: 'home_gym', name: 'Home Gym Equipment', description: 'Weights, bands, mats', trending: true },
        { id: 'yoga_pilates', name: 'Yoga & Pilates', description: 'Mats, blocks, straps', trending: true },
        { id: 'recovery', name: 'Recovery Tools', description: 'Foam rollers, massagers', trending: true },
        { id: 'fitness_tech', name: 'Fitness Tech', description: 'Smart watches, trackers', trending: true },
        { id: 'supplements', name: 'Supplements', description: 'Protein, vitamins, wellness', trending: false },
        { id: 'outdoor_fitness', name: 'Outdoor Fitness', description: 'Running, cycling, sports', trending: false },
      ],
    };

    return subcategories[category] || [
      { id: 'general', name: 'General', description: 'General products in this category', trending: false },
    ];
  }

  // Generate demographics options based on niche
  private generateDemographicsOptions(existingData: StoreConfigData): any[] {
    const baseOptions = {
      age_ranges: [
        { id: '18-24', name: '18-24', description: 'Gen Z, college students, young professionals' },
        { id: '25-34', name: '25-34', description: 'Millennials, establishing careers' },
        { id: '35-44', name: '35-44', description: 'Established professionals, parents' },
        { id: '45-54', name: '45-54', description: 'Mid-career, higher disposable income' },
        { id: '55-64', name: '55-64', description: 'Pre-retirement, experienced buyers' },
        { id: '65+', name: '65+', description: 'Retirees, seniors' },
      ],
      income_levels: [
        { id: 'budget', name: 'Budget-Conscious', description: 'Price-sensitive, looking for deals' },
        { id: 'middle', name: 'Middle Income', description: 'Balanced spending, value-focused' },
        { id: 'upper', name: 'Upper Middle', description: 'Willing to pay for quality' },
        { id: 'luxury', name: 'Luxury', description: 'Price is no object, premium only' },
      ],
      locations: [
        { id: 'us', name: 'United States', description: 'Largest e-commerce market' },
        { id: 'ca', name: 'Canada', description: 'Similar tastes, shipping friendly' },
        { id: 'uk', name: 'United Kingdom', description: 'English-speaking, good market' },
        { id: 'au', name: 'Australia', description: 'High purchasing power' },
        { id: 'eu', name: 'Europe', description: 'Diverse markets, good potential' },
      ],
    };

    return baseOptions;
  }

  // Generate pain points based on niche
  private generatePainPoints(existingData: StoreConfigData): any[] {
    const category = existingData.marketCategory;
    
    const painPointsByCategory: Record<string, any[]> = {
      pet_supplies: [
        { id: 'durability', name: "Products don't last", description: 'Cheap toys break, beds flatten quickly' },
        { id: 'safety', name: 'Safety concerns', description: 'Toxic materials, choking hazards' },
        { id: 'expensive', name: 'Too expensive', description: 'Premium products cost too much' },
        { id: 'selection', name: "Limited selection", description: "Can't find products for specific needs" },
        { id: 'sizing', name: 'Sizing issues', description: 'Hard to find right size for their pet' },
        { id: 'convenience', name: 'Shopping inconvenience', description: 'Hard to find everything in one place' },
      ],
      home_garden: [
        { id: 'quality', name: 'Poor quality', description: 'Products break or look cheap' },
        { id: 'assembly', name: 'Difficult assembly', description: 'Complicated instructions, missing parts' },
        { id: 'space', name: 'Space constraints', description: 'Need compact/small space solutions' },
        { id: 'style', name: "Can't find their style", description: 'Generic products, nothing unique' },
        { id: 'price', name: 'High prices', description: 'Home goods are too expensive' },
        { id: 'function', name: 'Not functional', description: 'Looks good but does not work well' },
      ],
      beauty_care: [
        { id: 'sensitive', name: 'Sensitive skin', description: 'Reactions to harsh chemicals' },
        { id: 'results', name: 'No visible results', description: "Products don't work as promised" },
        { id: 'clutter', name: 'Bathroom clutter', description: 'Too many products, no organization' },
        { id: 'time', name: 'Time consuming', description: 'Routines take too long' },
        { id: 'cost', name: 'High cost', description: 'Quality products are expensive' },
        { id: 'confusion', name: 'Too many choices', description: 'Overwhelmed by options' },
      ],
    };

    return painPointsByCategory[category || ''] || [
      { id: 'price', name: 'Too expensive', description: 'Current options cost too much' },
      { id: 'quality', name: 'Poor quality', description: "Products break or don't last" },
      { id: 'availability', name: 'Hard to find', description: 'Products not available locally' },
      { id: 'selection', name: 'Limited options', description: 'Not enough variety to choose from' },
    ];
  }

  // Use AI to generate contextual options
  private async generateAIOptions(
    stepNumber: number,
    existingData: StoreConfigData
  ): Promise<any[]> {
    const prompt = this.buildAIOptionsPrompt(stepNumber, existingData);

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'moonshotai/kimi-k2.5',
        messages: [
          { role: 'system', content: 'You are an e-commerce expert helping define store configurations. Respond with JSON only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      },
      {
        headers: {
          'Authorization': `Bearer ${this.openRouterApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const content = response.data.choices[0].message.content;
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content;
      const parsed = JSON.parse(jsonStr);
      return parsed.options || [];
    } catch (e) {
      console.error('Failed to parse AI options:', e);
      return [];
    }
  }

  private buildAIOptionsPrompt(stepNumber: number, data: StoreConfigData): string {
    const baseContext = `Market Category: ${data.marketCategory || 'Not selected'}
Subcategory: ${data.marketSubcategory || 'Not selected'}
Niche: ${data.marketNiche || 'Not selected'}`;

    if (stepNumber === 6) {
      return `Based on this business context, generate 5-7 specific pain points that customers in this niche face:

${baseContext}

Respond with JSON in this format:
{
  "options": [
    {"id": "pain_point_1", "name": "Short name", "description": "Detailed description of the pain point"}
  ]
}`;
    }

    return `Generate relevant options for step ${stepNumber} based on:
${baseContext}

Respond with JSON: {"options": [{"id": "...", "name": "...", "description": "..."}]}`;
  }

  // Save onboarding progress
  async saveOnboardingStep(
    storeId: string,
    userId: string,
    stepNumber: number,
    stepName: string,
    data: any
  ) {
    // Get current config
    const { data: config } = await supabase
      .from('store_configs')
      .select('*')
      .eq('store_id', storeId)
      .single();

    // Merge new data with existing onboarding_data
    const updatedOnboardingData = {
      ...(config?.onboarding_data || {}),
      [stepName]: data,
    };

    // Determine next status
    const statusMap: Record<number, string> = {
      1: 'market_selected',
      4: 'audience_defined',
      7: 'brand_configured',
      9: 'products_selected',
      11: 'complete',
    };

    const { data: updatedConfig, error } = await supabase
      .from('store_configs')
      .update({
        onboarding_step: stepNumber + 1,
        onboarding_status: statusMap[stepNumber] || config?.onboarding_status || 'incomplete',
        onboarding_data: updatedOnboardingData,
        [this.getColumnNameForStep(stepName)]: data,
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', storeId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    // Log the change
    await supabase.from('store_config_history').insert({
      store_config_id: updatedConfig.id,
      changed_by: 'user',
      field_changed: stepName,
      new_value: data,
      change_reason: `Completed onboarding step ${stepNumber}`,
    });

    return updatedConfig;
  }

  private getColumnNameForStep(stepName: string): string {
    const mapping: Record<string, string> = {
      market_category: 'market_category',
      market_subcategory: 'market_subcategory',
      market_niche: 'market_niche',
      target_audience_demographics: 'target_audience',
      target_audience_psychographics: 'target_audience',
      pain_points: 'target_audience',
      brand_voice: 'brand_voice',
      site_style: 'site_style',
      product_strategy: 'product_strategy',
      marketing_approach: 'marketing_budget_monthly',
      business_goals: 'business_goals',
    };
    return mapping[stepName] || 'onboarding_data';
  }

  // Generate AI context summary once onboarding is complete
  async generateAIContextSummary(storeId: string): Promise<string> {
    const { data: config } = await supabase
      .from('store_configs')
      .select('*')
      .eq('store_id', storeId)
      .single();

    if (!config) throw new Error('Store config not found');

    const summary = `Store: ${config.market_niche || config.market_subcategory}
Target: ${config.target_audience?.primary?.age_range || 'General'} audience interested in ${config.target_audience?.psychographics?.interests?.join(', ') || 'this category'}
Pain Points: ${config.target_audience?.pain_points?.join(', ') || 'Quality, price, convenience'}
Brand Voice: ${config.brand_voice || 'Friendly'}
Style: ${config.site_style || 'Modern'}
Goals: ${config.business_goals?.map((g: any) => g.goal).join(', ') || 'Launch and grow store'}`;

    await supabase
      .from('store_configs')
      .update({ ai_context_summary: summary })
      .eq('store_id', storeId);

    return summary;
  }

  // Check if onboarding is complete enough to start workflow
  canStartWorkflow(config: any): { ready: boolean; missing: string[] } {
    const required = ['market_category', 'market_niche', 'brand_voice', 'site_style'];
    const missing: string[] = [];

    for (const field of required) {
      if (!config[field]) {
        missing.push(field);
      }
    }

    return {
      ready: missing.length === 0,
      missing,
    };
  }
}

export const onboardingService = new OnboardingService();
