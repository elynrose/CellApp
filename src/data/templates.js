// Template definitions for the GPT Cells App
// Each template defines a workflow with multiple connected cells

export const TEMPLATES = {
  // Content Creation Templates
  'blog-post': {
    id: 'blog-post',
    name: 'Blog Post Generator',
    description: 'Create a complete blog post with outline, content, and featured image',
    category: 'content',
    icon: '📝',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Topic',
        prompt: 'Generate a blog post outline for: [topic]',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Draft',
        prompt: 'Write a full blog post based on this outline:\n\n{{A1}}\n\nMake it engaging and well-structured.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'SEO Optimization',
        prompt: 'Optimize this blog post for SEO:\n\n{{B1}}\n\nAdd meta description, keywords, and improve readability.',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'B2',
        cellReference: 'B2',
        name: 'Featured Image',
        prompt: 'Create a featured image for a blog post about: {{A1}}',
        modelType: 'image',
        preferredModel: 'flux/dev',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: '',
        autoRun: true,
        x: 400,
        y: 250
      }
    ]
  },

  'social-media-post': {
    id: 'social-media-post',
    name: 'Social Media Post',
    description: 'Generate social media content with text, image, and video',
    category: 'marketing',
    icon: '📱',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Post Idea',
        prompt: 'Generate 5 engaging social media post ideas about: [topic]',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.8,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Post Text',
        prompt: 'Write a compelling social media post based on this idea:\n\n{{A1}}\n\nKeep it under 280 characters.',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        characterLimit: 280,
        outputFormat: 'plain',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'B2',
        cellReference: 'B2',
        name: 'Post Image',
        prompt: 'Create an eye-catching social media image for: {{A1}}',
        modelType: 'image',
        preferredModel: 'flux/dev',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: '',
        autoRun: true,
        x: 400,
        y: 100
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Hashtags',
        prompt: 'Generate relevant hashtags for this post:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'plain',
        autoRun: true,
        x: 100,
        y: 400
      }
    ]
  },

  'product-description': {
    id: 'product-description',
    name: 'Product Description Generator',
    description: 'Create compelling product descriptions with marketing copy',
    category: 'business',
    icon: '🛍️',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Product Info',
        prompt: 'Analyze this product and create a detailed description:\n\nProduct: [productName]\nFeatures: [features]\nTarget Audience: [audience]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Marketing Copy',
        prompt: 'Create compelling marketing copy for this product:\n\n{{A1}}\n\nFocus on benefits and emotional appeal.',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.8,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'B2',
        cellReference: 'B2',
        name: 'Product Image',
        prompt: 'Generate a professional product image for: [productName]',
        modelType: 'image',
        preferredModel: 'flux/dev',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: '',
        autoRun: false,
        x: 400,
        y: 100
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'SEO Description',
        prompt: 'Create an SEO-optimized product description:\n\n{{B1}}\n\nInclude keywords naturally.',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      }
    ]
  },

  'email-campaign': {
    id: 'email-campaign',
    name: 'Email Campaign Builder',
    description: 'Create complete email campaigns with subject, body, and visuals',
    category: 'marketing',
    icon: '📧',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Campaign Goal',
        prompt: 'Define the email campaign strategy for: [goal]\n\nTarget: [audience]\nObjective: [objective]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Subject Line',
        prompt: 'Generate 10 compelling email subject lines based on:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.8,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Email Body',
        prompt: 'Write the email body:\n\n{{A1}}\n\nUse the best subject line from: {{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Call to Action',
        prompt: 'Create a compelling CTA button text and link description:\n\n{{C1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        x: 100,
        y: 550
      }
    ]
  },

  'video-script': {
    id: 'video-script',
    name: 'Video Script Generator',
    description: 'Create video scripts with storyboard and thumbnail',
    category: 'content',
    icon: '🎬',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Video Concept',
        prompt: 'Develop a video concept:\n\nTopic: [topic]\nDuration: [duration]\nStyle: [style]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.8,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Script',
        prompt: 'Write a complete video script:\n\n{{A1}}\n\nInclude dialogue, narration, and scene descriptions.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Storyboard',
        prompt: 'Create a storyboard description:\n\n{{B1}}\n\nBreak down into key scenes with visual descriptions.',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'B2',
        cellReference: 'B2',
        name: 'Thumbnail',
        prompt: 'Generate a YouTube thumbnail image for: {{A1}}',
        modelType: 'image',
        preferredModel: 'flux/dev',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: '',
        autoRun: true,
        x: 400,
        y: 100
      }
    ]
  },

  'meeting-notes': {
    id: 'meeting-notes',
    name: 'Meeting Notes Processor',
    description: 'Transform meeting transcripts into actionable summaries',
    category: 'productivity',
    icon: '📋',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Transcript',
        prompt: 'Transcribe and clean up this meeting recording:\n\n[audioFile]',
        modelType: 'audio',
        preferredModel: 'whisper-1',
        temperature: 0.0,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Summary',
        prompt: 'Create a concise meeting summary:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Action Items',
        prompt: 'Extract action items from the meeting:\n\n{{B1}}\n\nFormat as a checklist with owners and deadlines.',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.3,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Follow-up Email',
        prompt: 'Draft a follow-up email:\n\n{{C1}}\n\nInclude meeting summary and next steps.',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        x: 100,
        y: 550
      }
    ]
  },

  'research-assistant': {
    id: 'research-assistant',
    name: 'Research Assistant',
    description: 'Conduct research and generate comprehensive reports',
    category: 'education',
    icon: '🔬',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Research Question',
        prompt: 'Break down this research question into key areas:\n\n[question]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Research Points',
        prompt: 'Generate research points and key findings for:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Synthesis',
        prompt: 'Synthesize the research into a comprehensive report:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Citations',
        prompt: 'Generate proper citations and references for:\n\n{{C1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.3,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'story-creator': {
    id: 'story-creator',
    name: 'Story Creator',
    description: 'Create stories with characters, plot, and illustrations',
    category: 'creative',
    icon: '📖',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Plot',
        prompt: 'Develop a story plot:\n\nGenre: [genre]\nTheme: [theme]\nLength: [length]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.8,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Characters',
        prompt: 'Create detailed characters for this story:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Story',
        prompt: 'Write the complete story:\n\n{{A1}}\n\nCharacters: {{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.8,
        x: 100,
        y: 400
      },
      {
        cellId: 'B2',
        cellReference: 'B2',
        name: 'Illustration',
        prompt: 'Create an illustration for this story:\n\n{{A1}}',
        modelType: 'image',
        preferredModel: 'flux/dev',
        temperature: 0.7,
        x: 400,
        y: 250
      }
    ]
  },

  'recipe-generator': {
    id: 'recipe-generator',
    name: 'Recipe Generator',
    description: 'Generate recipes with ingredients, instructions, and food images',
    category: 'personal',
    icon: '🍳',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Recipe Concept',
        prompt: 'Create a recipe concept:\n\nCuisine: [cuisine]\nDietary: [dietary]\nDifficulty: [difficulty]',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Ingredients',
        prompt: 'List all ingredients with quantities:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Instructions',
        prompt: 'Write step-by-step cooking instructions:\n\n{{A1}}\n\nIngredients: {{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'numbered-list',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'B2',
        cellReference: 'B2',
        name: 'Food Image',
        prompt: 'Generate an appetizing food image for: {{A1}}',
        modelType: 'image',
        preferredModel: 'flux/dev',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: '',
        autoRun: true,
        x: 400,
        y: 100
      }
    ]
  },

  'presentation-builder': {
    id: 'presentation-builder',
    name: 'Presentation Builder',
    description: 'Create presentations with content, visuals, and speaker notes',
    category: 'business',
    icon: '📊',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Topic',
        prompt: 'Create a presentation outline:\n\nTopic: [topic]\nAudience: [audience]\nDuration: [duration]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Slides',
        prompt: 'Generate slide content:\n\n{{A1}}\n\nCreate engaging bullet points for each slide.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Visuals',
        prompt: 'Suggest visual concepts for each slide:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Speaker Notes',
        prompt: 'Create detailed speaker notes:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        x: 100,
        y: 550
      }
    ]
  },

  'code-generator': {
    id: 'code-generator',
    name: 'Code Generator',
    description: 'Generate code with documentation and tests',
    category: 'productivity',
    icon: '💻',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Requirements',
        prompt: 'Analyze these coding requirements:\n\nLanguage: [language]\nTask: [task]\nConstraints: [constraints]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.3,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Code',
        prompt: 'Write clean, well-commented code:\n\n{{A1}}\n\nFollow best practices and include error handling.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.2,
        characterLimit: 0,
        outputFormat: 'code',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Documentation',
        prompt: 'Generate comprehensive documentation:\n\n{{B1}}\n\nInclude usage examples and API reference.',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Tests',
        prompt: 'Create unit tests:\n\n{{B1}}\n\nCover edge cases and error scenarios.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.3,
        characterLimit: 0,
        outputFormat: 'code',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'resume-builder': {
    id: 'resume-builder',
    name: 'Resume Builder',
    description: 'Create professional resumes with cover letters',
    category: 'business',
    icon: '📄',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Profile Info',
        prompt: 'Organize resume information:\n\nName: [name]\nExperience: [experience]\nSkills: [skills]\nEducation: [education]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Resume',
        prompt: 'Create a professional resume:\n\n{{A1}}\n\nFormat it clearly with sections for experience, skills, and education.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Cover Letter',
        prompt: 'Write a compelling cover letter:\n\n{{A1}}\n\nJob: [jobTitle]\nCompany: [company]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'LinkedIn Summary',
        prompt: 'Create a professional LinkedIn summary:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'plain',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'newsletter-generator': {
    id: 'newsletter-generator',
    name: 'Newsletter Generator',
    description: 'Create engaging newsletters with content and visuals',
    category: 'marketing',
    icon: '📰',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Theme',
        prompt: 'Define newsletter theme and topics:\n\nTheme: [theme]\nTarget: [audience]\nDate: [date]',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Content',
        prompt: 'Write newsletter articles:\n\n{{A1}}\n\nMake it engaging and valuable for readers.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Subject Line',
        prompt: 'Generate compelling email subject lines:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.8,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'B2',
        cellReference: 'B2',
        name: 'Header Image',
        prompt: 'Create a newsletter header image for: {{A1}}',
        modelType: 'image',
        preferredModel: 'flux/dev',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: '',
        autoRun: true,
        x: 400,
        y: 100
      }
    ]
  },

  'landing-page-copy': {
    id: 'landing-page-copy',
    name: 'Landing Page Copy',
    description: 'Create compelling landing page copy with headlines and CTAs',
    category: 'marketing',
    icon: '🌐',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Product Info',
        prompt: 'Define product and value proposition:\n\nProduct: [product]\nBenefits: [benefits]\nTarget: [audience]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Headline',
        prompt: 'Generate 10 powerful headlines:\n\n{{A1}}\n\nMake them attention-grabbing and benefit-focused.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.8,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Body Copy',
        prompt: 'Write compelling body copy:\n\n{{A1}}\n\nUse the best headline from: {{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'CTA Buttons',
        prompt: 'Create multiple CTA variations:\n\n{{C1}}\n\nMake them action-oriented and urgent.',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.8,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'ad-copy-generator': {
    id: 'ad-copy-generator',
    name: 'Ad Copy Generator',
    description: 'Create ad copy for Google, Facebook, and other platforms',
    category: 'marketing',
    icon: '📢',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Campaign Brief',
        prompt: 'Define ad campaign:\n\nProduct: [product]\nPlatform: [platform]\nGoal: [goal]\nAudience: [audience]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Headlines',
        prompt: 'Generate 15 ad headlines:\n\n{{A1}}\n\nPlatform-specific and attention-grabbing.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.8,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Ad Copy',
        prompt: 'Write complete ad copy:\n\n{{A1}}\n\nUse best headlines from: {{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Keywords',
        prompt: 'Generate relevant keywords and hashtags:\n\n{{C1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'study-guide': {
    id: 'study-guide',
    name: 'Study Guide Creator',
    description: 'Create comprehensive study guides from course materials',
    category: 'education',
    icon: '📚',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Course Material',
        prompt: 'Organize course content:\n\nSubject: [subject]\nTopics: [topics]\nKey Concepts: [concepts]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Study Guide',
        prompt: 'Create a comprehensive study guide:\n\n{{A1}}\n\nOrganize by topics with key points and examples.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Practice Questions',
        prompt: 'Generate practice questions:\n\n{{B1}}\n\nInclude multiple choice, short answer, and essay questions.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Flashcards',
        prompt: 'Create flashcard content:\n\n{{B1}}\n\nFormat as question-answer pairs.',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'interview-prep': {
    id: 'interview-prep',
    name: 'Interview Preparation',
    description: 'Prepare for job interviews with questions and answers',
    category: 'business',
    icon: '🎤',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Job Details',
        prompt: 'Organize interview information:\n\nPosition: [position]\nCompany: [company]\nRequirements: [requirements]\nExperience: [experience]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Questions',
        prompt: 'Generate likely interview questions:\n\n{{A1}}\n\nInclude behavioral, technical, and situational questions.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Answers',
        prompt: 'Create strong answers:\n\n{{B1}}\n\nUse STAR method for behavioral questions.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Questions to Ask',
        prompt: 'Generate thoughtful questions to ask the interviewer:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'travel-planner': {
    id: 'travel-planner',
    name: 'Travel Planner',
    description: 'Plan trips with itineraries, recommendations, and packing lists',
    category: 'personal',
    icon: '✈️',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Trip Details',
        prompt: 'Define trip parameters:\n\nDestination: [destination]\nDuration: [duration]\nBudget: [budget]\nInterests: [interests]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Itinerary',
        prompt: 'Create a detailed day-by-day itinerary:\n\n{{A1}}\n\nInclude activities, restaurants, and attractions.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Packing List',
        prompt: 'Generate a comprehensive packing list:\n\n{{A1}}\n\nConsider weather, activities, and duration.',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Tips & Info',
        prompt: 'Provide travel tips and local information:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'workout-planner': {
    id: 'workout-planner',
    name: 'Workout Plan Generator',
    description: 'Create personalized workout plans with exercises and nutrition',
    category: 'personal',
    icon: '💪',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Fitness Goals',
        prompt: 'Define fitness objectives:\n\nGoal: [goal]\nLevel: [level]\nEquipment: [equipment]\nFrequency: [frequency]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Workout Plan',
        prompt: 'Create a detailed workout plan:\n\n{{A1}}\n\nInclude exercises, sets, reps, and rest periods.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Nutrition Guide',
        prompt: 'Create a nutrition plan:\n\n{{A1}}\n\nInclude meal suggestions and macros.',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Progress Tracking',
        prompt: 'Create a progress tracking template:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'content-calendar': {
    id: 'content-calendar',
    name: 'Content Calendar',
    description: 'Plan and schedule social media and blog content',
    category: 'marketing',
    icon: '📅',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Strategy',
        prompt: 'Define content strategy:\n\nPlatforms: [platforms]\nThemes: [themes]\nFrequency: [frequency]\nGoals: [goals]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Calendar',
        prompt: 'Create a content calendar:\n\n{{A1}}\n\nPlan posts for the next 30 days with themes and topics.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Content Ideas',
        prompt: 'Generate content ideas:\n\n{{B1}}\n\nCreate engaging post concepts for each day.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.8,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Hashtags',
        prompt: 'Generate relevant hashtag sets:\n\n{{C1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'podcast-script': {
    id: 'podcast-script',
    name: 'Podcast Script Generator',
    description: 'Create podcast scripts with intros, segments, and outros',
    category: 'content',
    icon: '🎙️',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Episode Concept',
        prompt: 'Define podcast episode:\n\nTopic: [topic]\nGuests: [guests]\nDuration: [duration]\nFormat: [format]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Script',
        prompt: 'Write a complete podcast script:\n\n{{A1}}\n\nInclude intro, segments, transitions, and outro.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.8,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Show Notes',
        prompt: 'Create show notes:\n\n{{B1}}\n\nInclude key points, timestamps, and links.',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Social Posts',
        prompt: 'Generate social media posts to promote:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.8,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'business-plan': {
    id: 'business-plan',
    name: 'Business Plan Generator',
    description: 'Create comprehensive business plans with market analysis',
    category: 'business',
    icon: '📈',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Business Concept',
        prompt: 'Define business idea:\n\nProduct/Service: [product]\nMarket: [market]\nTarget: [audience]\nGoals: [goals]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Market Analysis',
        prompt: 'Conduct market analysis:\n\n{{A1}}\n\nInclude competitors, trends, and opportunities.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Business Plan',
        prompt: 'Write comprehensive business plan:\n\n{{A1}}\n\nMarket: {{B1}}\n\nInclude executive summary, strategy, and financial projections.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Pitch Deck Outline',
        prompt: 'Create pitch deck structure:\n\n{{C1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'api-documentation': {
    id: 'api-documentation',
    name: 'API Documentation Generator',
    description: 'Generate comprehensive API documentation with examples',
    category: 'productivity',
    icon: '🔌',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'API Spec',
        prompt: 'Define API specification:\n\nEndpoints: [endpoints]\nMethods: [methods]\nParameters: [parameters]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.3,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Documentation',
        prompt: 'Write comprehensive API documentation:\n\n{{A1}}\n\nInclude endpoints, request/response examples, and error codes.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.4,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Code Examples',
        prompt: 'Generate code examples:\n\n{{B1}}\n\nInclude examples in multiple languages (Python, JavaScript, cURL).',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.3,
        characterLimit: 0,
        outputFormat: 'code',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'SDK Guide',
        prompt: 'Create SDK integration guide:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'customer-support': {
    id: 'customer-support',
    name: 'Customer Support Response',
    description: 'Generate professional customer support responses',
    category: 'business',
    icon: '💬',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Customer Issue',
        prompt: 'Analyze customer inquiry:\n\nIssue: [issue]\nProduct: [product]\nUrgency: [urgency]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Response',
        prompt: 'Write a professional, empathetic response:\n\n{{A1}}\n\nBe helpful, clear, and solution-oriented.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Follow-up Steps',
        prompt: 'Outline follow-up actions:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Internal Notes',
        prompt: 'Create internal notes for team:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.3,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'event-planner': {
    id: 'event-planner',
    name: 'Event Planning Assistant',
    description: 'Plan events with checklists, timelines, and vendor coordination',
    category: 'business',
    icon: '🎉',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Event Details',
        prompt: 'Define event parameters:\n\nType: [type]\nDate: [date]\nGuests: [guests]\nBudget: [budget]\nTheme: [theme]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Timeline',
        prompt: 'Create event planning timeline:\n\n{{A1}}\n\nInclude milestones and deadlines.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Checklist',
        prompt: 'Generate comprehensive checklist:\n\n{{A1}}\n\nCover all aspects: venue, catering, decor, etc.',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Vendor List',
        prompt: 'Suggest vendors and suppliers:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'financial-planning': {
    id: 'financial-planning',
    name: 'Financial Planning Tool',
    description: 'Create financial plans with budgets, goals, and strategies',
    category: 'business',
    icon: '💰',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Financial Goals',
        prompt: 'Define financial objectives:\n\nGoals: [goals]\nTimeline: [timeline]\nIncome: [income]\nExpenses: [expenses]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.4,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Budget Plan',
        prompt: 'Create detailed budget:\n\n{{A1}}\n\nCategorize income and expenses.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Savings Strategy',
        prompt: 'Develop savings strategy:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Investment Plan',
        prompt: 'Suggest investment strategies:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'grant-proposal': {
    id: 'grant-proposal',
    name: 'Grant Proposal Writer',
    description: 'Write compelling grant proposals with budgets and impact statements',
    category: 'business',
    icon: '📋',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Project Overview',
        prompt: 'Define project details:\n\nOrganization: [org]\nProject: [project]\nNeed: [need]\nAmount: [amount]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Proposal',
        prompt: 'Write grant proposal:\n\n{{A1}}\n\nInclude problem statement, solution, and impact.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Budget',
        prompt: 'Create detailed budget breakdown:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.3,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Impact Statement',
        prompt: 'Write impact statement:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'language-learning': {
    id: 'language-learning',
    name: 'Language Learning Assistant',
    description: 'Create language lessons with vocabulary, grammar, and practice',
    category: 'education',
    icon: '🌍',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Learning Goals',
        prompt: 'Define language learning objectives:\n\nLanguage: [language]\nLevel: [level]\nFocus: [focus]\nTime: [time]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Vocabulary',
        prompt: 'Generate vocabulary list:\n\n{{A1}}\n\nInclude common words with translations and examples.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Grammar Guide',
        prompt: 'Create grammar lesson:\n\n{{A1}}\n\nExplain key grammar rules with examples.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Practice Exercises',
        prompt: 'Generate practice exercises:\n\n{{B1}}\n\nGrammar: {{C1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'legal-document': {
    id: 'legal-document',
    name: 'Legal Document Draft',
    description: 'Draft legal documents with terms, clauses, and compliance',
    category: 'business',
    icon: '⚖️',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Document Type',
        prompt: 'Define document requirements:\n\nType: [type]\nParties: [parties]\nPurpose: [purpose]\nJurisdiction: [jurisdiction]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.3,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Draft',
        prompt: 'Draft legal document:\n\n{{A1}}\n\nInclude all necessary clauses and terms.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.4,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Review Checklist',
        prompt: 'Create review checklist:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Compliance Notes',
        prompt: 'Generate compliance considerations:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.3,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'meal-planner': {
    id: 'meal-planner',
    name: 'Meal Planning Assistant',
    description: 'Plan meals with recipes, shopping lists, and nutrition info',
    category: 'personal',
    icon: '🍽️',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Dietary Preferences',
        prompt: 'Define meal planning parameters:\n\nDiet: [diet]\nPreferences: [preferences]\nAllergies: [allergies]\nServings: [servings]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Meal Plan',
        prompt: 'Create weekly meal plan:\n\n{{A1}}\n\nInclude breakfast, lunch, dinner, and snacks.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Shopping List',
        prompt: 'Generate shopping list:\n\n{{B1}}\n\nOrganize by store sections.',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Nutrition Summary',
        prompt: 'Calculate nutrition info:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.4,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'project-proposal': {
    id: 'project-proposal',
    name: 'Project Proposal Generator',
    description: 'Create project proposals with scope, timeline, and resources',
    category: 'business',
    icon: '📊',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Project Brief',
        prompt: 'Define project details:\n\nName: [name]\nObjective: [objective]\nStakeholders: [stakeholders]\nBudget: [budget]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Proposal',
        prompt: 'Write project proposal:\n\n{{A1}}\n\nInclude scope, deliverables, and timeline.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Timeline',
        prompt: 'Create project timeline:\n\n{{B1}}\n\nInclude milestones and deadlines.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Resource Plan',
        prompt: 'Outline resource requirements:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'real-estate-listing': {
    id: 'real-estate-listing',
    name: 'Real Estate Listing Writer',
    description: 'Create compelling property listings with descriptions and features',
    category: 'business',
    icon: '🏠',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Property Details',
        prompt: 'Organize property information:\n\nType: [type]\nLocation: [location]\nFeatures: [features]\nPrice: [price]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Listing Description',
        prompt: 'Write compelling property description:\n\n{{A1}}\n\nHighlight key features and benefits.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Feature List',
        prompt: 'Create detailed feature list:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'B2',
        cellReference: 'B2',
        name: 'Property Image',
        prompt: 'Generate a professional property image for: {{A1}}',
        modelType: 'image',
        preferredModel: 'flux/dev',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: '',
        autoRun: false,
        x: 400,
        y: 100
      }
    ]
  },

  'sales-email': {
    id: 'sales-email',
    name: 'Sales Email Generator',
    description: 'Create personalized sales emails with follow-ups',
    category: 'marketing',
    icon: '📧',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Prospect Info',
        prompt: 'Define prospect details:\n\nCompany: [company]\nRole: [role]\nPain Points: [pain]\nSolution: [solution]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Initial Email',
        prompt: 'Write personalized sales email:\n\n{{A1}}\n\nBe concise, value-focused, and include clear CTA.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Follow-up 1',
        prompt: 'Create first follow-up email:\n\n{{B1}}\n\nAdd new value and maintain interest.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Follow-up 2',
        prompt: 'Create second follow-up email:\n\n{{C1}}\n\nFinal attempt with strong value proposition.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 550
      }
    ]
  },

  'technical-writing': {
    id: 'technical-writing',
    name: 'Technical Documentation',
    description: 'Create technical documentation with guides and tutorials',
    category: 'productivity',
    icon: '📖',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Topic',
        prompt: 'Define technical topic:\n\nSubject: [subject]\nAudience: [audience]\nComplexity: [complexity]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.4,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Documentation',
        prompt: 'Write technical documentation:\n\n{{A1}}\n\nClear, structured, with examples.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Code Examples',
        prompt: 'Add code examples:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.3,
        characterLimit: 0,
        outputFormat: 'code',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'FAQ',
        prompt: 'Generate FAQ section:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'web-copy': {
    id: 'web-copy',
    name: 'Website Copy Generator',
    description: 'Create website copy for pages, sections, and CTAs',
    category: 'marketing',
    icon: '🌐',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Page Brief',
        prompt: 'Define page requirements:\n\nPage: [page]\nPurpose: [purpose]\nAudience: [audience]\nTone: [tone]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Hero Section',
        prompt: 'Write hero section copy:\n\n{{A1}}\n\nCompelling headline and subheadline.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.8,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Body Copy',
        prompt: 'Write body content:\n\n{{A1}}\n\nHero: {{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'CTAs',
        prompt: 'Generate call-to-action buttons:\n\n{{C1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.8,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'white-paper': {
    id: 'white-paper',
    name: 'White Paper Generator',
    description: 'Create comprehensive white papers with research and analysis',
    category: 'business',
    icon: '📄',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Topic',
        prompt: 'Define white paper topic:\n\nSubject: [subject]\nProblem: [problem]\nSolution: [solution]\nAudience: [audience]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Research',
        prompt: 'Conduct research and analysis:\n\n{{A1}}\n\nInclude data, statistics, and case studies.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'White Paper',
        prompt: 'Write comprehensive white paper:\n\n{{A1}}\n\nResearch: {{B1}}\n\nProfessional, authoritative tone.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Executive Summary',
        prompt: 'Create executive summary:\n\n{{C1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'course-creator': {
    id: 'course-creator',
    name: 'Online Course Creator',
    description: 'Design courses with curriculum, lessons, and assessments',
    category: 'education',
    icon: '🎓',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Course Outline',
        prompt: 'Define course structure:\n\nTopic: [topic]\nLevel: [level]\nDuration: [duration]\nLearning Goals: [goals]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Curriculum',
        prompt: 'Create detailed curriculum:\n\n{{A1}}\n\nBreak into modules and lessons.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Lesson Content',
        prompt: 'Write lesson content:\n\n{{B1}}\n\nEngaging and educational.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Assessments',
        prompt: 'Create quizzes and assignments:\n\n{{C1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'press-release': {
    id: 'press-release',
    name: 'Press Release Writer',
    description: 'Write professional press releases with quotes and media info',
    category: 'marketing',
    icon: '📰',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'News Details',
        prompt: 'Define press release info:\n\nEvent: [event]\nCompany: [company]\nDate: [date]\nKey Points: [points]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Press Release',
        prompt: 'Write professional press release:\n\n{{A1}}\n\nFollow standard format with headline, dateline, body, and boilerplate.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Quotes',
        prompt: 'Generate executive quotes:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.8,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Media Contact',
        prompt: 'Create media contact section:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'product-review': {
    id: 'product-review',
    name: 'Product Review Writer',
    description: 'Write comprehensive product reviews with pros, cons, and ratings',
    category: 'content',
    icon: '⭐',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Product Info',
        prompt: 'Define product details:\n\nProduct: [product]\nCategory: [category]\nFeatures: [features]\nPrice: [price]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Review',
        prompt: 'Write comprehensive review:\n\n{{A1}}\n\nInclude detailed analysis, pros, cons, and use cases.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Rating',
        prompt: 'Provide detailed rating breakdown:\n\n{{B1}}\n\nRate different aspects (quality, value, features, etc.).',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Verdict',
        prompt: 'Write final verdict and recommendation:\n\n{{B1}}\n\nRating: {{C1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'hr-onboarding': {
    id: 'hr-onboarding',
    name: 'HR Onboarding Plan',
    description: 'Create employee onboarding plans with checklists and materials',
    category: 'business',
    icon: '👥',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Role Details',
        prompt: 'Define onboarding parameters:\n\nRole: [role]\nDepartment: [dept]\nLevel: [level]\nDuration: [duration]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Onboarding Plan',
        prompt: 'Create comprehensive onboarding plan:\n\n{{A1}}\n\nWeek-by-week schedule with activities.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Checklist',
        prompt: 'Generate onboarding checklist:\n\n{{B1}}\n\nAll tasks and milestones.',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Welcome Materials',
        prompt: 'Create welcome email and materials:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'book-outline': {
    id: 'book-outline',
    name: 'Book Outline Generator',
    description: 'Create book outlines with chapters, themes, and structure',
    category: 'creative',
    icon: '📚',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Book Concept',
        prompt: 'Define book idea:\n\nGenre: [genre]\nTheme: [theme]\nLength: [length]\nTarget: [audience]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Outline',
        prompt: 'Create detailed book outline:\n\n{{A1}}\n\nChapter-by-chapter structure with plot points.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.8,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Characters',
        prompt: 'Develop main characters:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Chapter Summaries',
        prompt: 'Write chapter summaries:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'sop-creator': {
    id: 'sop-creator',
    name: 'Standard Operating Procedure',
    description: 'Create SOPs with procedures, checklists, and compliance',
    category: 'business',
    icon: '📋',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Process Overview',
        prompt: 'Define process details:\n\nProcess: [process]\nDepartment: [dept]\nPurpose: [purpose]\nScope: [scope]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.4,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'SOP Document',
        prompt: 'Write comprehensive SOP:\n\n{{A1}}\n\nStep-by-step procedures with clear instructions.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Checklist',
        prompt: 'Create procedure checklist:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.4,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Compliance Notes',
        prompt: 'Add compliance and safety notes:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.4,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'case-study': {
    id: 'case-study',
    name: 'Case Study Writer',
    description: 'Create case studies with problem, solution, and results',
    category: 'business',
    icon: '📊',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Client Info',
        prompt: 'Define case study details:\n\nClient: [client]\nIndustry: [industry]\nChallenge: [challenge]\nSolution: [solution]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Case Study',
        prompt: 'Write comprehensive case study:\n\n{{A1}}\n\nInclude background, challenge, solution, and results.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Results',
        prompt: 'Detail measurable results:\n\n{{B1}}\n\nInclude metrics, KPIs, and outcomes.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Testimonial',
        prompt: 'Generate client testimonial:\n\n{{B1}}\n\nResults: {{C1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.8,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'job-description': {
    id: 'job-description',
    name: 'Job Description Writer',
    description: 'Create job descriptions with requirements and responsibilities',
    category: 'business',
    icon: '💼',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Role Details',
        prompt: 'Define position requirements:\n\nTitle: [title]\nDepartment: [dept]\nLevel: [level]\nType: [type]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Job Description',
        prompt: 'Write comprehensive job description:\n\n{{A1}}\n\nInclude overview, responsibilities, and requirements.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Requirements',
        prompt: 'List detailed requirements:\n\n{{B1}}\n\nEducation, experience, skills, and qualifications.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Benefits',
        prompt: 'Create benefits section:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'app-description': {
    id: 'app-description',
    name: 'App Store Description',
    description: 'Write app store listings with features, screenshots, and keywords',
    category: 'marketing',
    icon: '📱',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'App Info',
        prompt: 'Define app details:\n\nName: [name]\nCategory: [category]\nFeatures: [features]\nTarget: [audience]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Description',
        prompt: 'Write compelling app description:\n\n{{A1}}\n\nHighlight key features and benefits.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Keywords',
        prompt: 'Generate app store keywords:\n\n{{A1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Screenshots Text',
        prompt: 'Create text for screenshot descriptions:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'data-analysis': {
    id: 'data-analysis',
    name: 'Data Analysis Report',
    description: 'Analyze data and create reports with insights and recommendations',
    category: 'business',
    icon: '📈',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Data Overview',
        prompt: 'Define analysis parameters:\n\nDataset: [dataset]\nMetrics: [metrics]\nTimeframe: [timeframe]\nGoals: [goals]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.4,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Analysis',
        prompt: 'Perform data analysis:\n\n{{A1}}\n\nIdentify trends, patterns, and anomalies.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Insights',
        prompt: 'Extract key insights:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Recommendations',
        prompt: 'Provide actionable recommendations:\n\n{{C1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'email-sequence': {
    id: 'email-sequence',
    name: 'Email Sequence Builder',
    description: 'Create email sequences for nurture campaigns and onboarding',
    category: 'marketing',
    icon: '📬',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Campaign Goals',
        prompt: 'Define email sequence:\n\nPurpose: [purpose]\nAudience: [audience]\nGoal: [goal]\nDuration: [duration]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Email 1',
        prompt: 'Write first email:\n\n{{A1}}\n\nWelcome/introduction email.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Email 2',
        prompt: 'Write second email:\n\n{{A1}}\n\nFollow-up with value.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Email 3',
        prompt: 'Write third email:\n\n{{A1}}\n\nFinal call-to-action.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'social-strategy': {
    id: 'social-strategy',
    name: 'Social Media Strategy',
    description: 'Develop social media strategies with goals, content, and metrics',
    category: 'marketing',
    icon: '📱',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Brand Overview',
        prompt: 'Define brand and goals:\n\nBrand: [brand]\nPlatforms: [platforms]\nGoals: [goals]\nAudience: [audience]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Strategy',
        prompt: 'Develop social media strategy:\n\n{{A1}}\n\nContent themes, posting schedule, engagement tactics.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Content Ideas',
        prompt: 'Generate content ideas:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.8,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'KPIs',
        prompt: 'Define success metrics:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'user-manual': {
    id: 'user-manual',
    name: 'User Manual Creator',
    description: 'Create user manuals with instructions, FAQs, and troubleshooting',
    category: 'productivity',
    icon: '📖',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Product Info',
        prompt: 'Define product details:\n\nProduct: [product]\nFeatures: [features]\nComplexity: [complexity]\nUsers: [users]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.4,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Manual',
        prompt: 'Write user manual:\n\n{{A1}}\n\nClear, step-by-step instructions with screenshots descriptions.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'FAQ',
        prompt: 'Create FAQ section:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Troubleshooting',
        prompt: 'Write troubleshooting guide:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'brand-guidelines': {
    id: 'brand-guidelines',
    name: 'Brand Guidelines Creator',
    description: 'Create brand guidelines with voice, tone, and visual identity',
    category: 'marketing',
    icon: '🎨',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Brand Identity',
        prompt: 'Define brand:\n\nBrand: [brand]\nValues: [values]\nPersonality: [personality]\nTarget: [audience]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Voice & Tone',
        prompt: 'Define brand voice and tone:\n\n{{A1}}\n\nWriting style, do\'s and don\'ts, examples.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Visual Guidelines',
        prompt: 'Create visual identity guidelines:\n\n{{A1}}\n\nColors, typography, imagery style.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Usage Examples',
        prompt: 'Provide usage examples:\n\n{{B1}}\n\nVisual: {{C1}}',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'influencer-brief': {
    id: 'influencer-brief',
    name: 'Influencer Campaign Brief',
    description: 'Create influencer campaign briefs with deliverables and guidelines',
    category: 'marketing',
    icon: '🌟',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Campaign Details',
        prompt: 'Define campaign parameters:\n\nBrand: [brand]\nProduct: [product]\nGoal: [goal]\nPlatform: [platform]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Campaign Brief',
        prompt: 'Write comprehensive campaign brief:\n\n{{A1}}\n\nInclude objectives, deliverables, and timeline.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.7,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Content Guidelines',
        prompt: 'Create content guidelines:\n\n{{B1}}\n\nTone, messaging, hashtags, and requirements.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Deliverables',
        prompt: 'List required deliverables:\n\n{{B1}}',
        modelType: 'text',
        preferredModel: 'gpt-3.5-turbo',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'bullet-list',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  },

  'risk-assessment': {
    id: 'risk-assessment',
    name: 'Risk Assessment Report',
    description: 'Create risk assessments with identification, analysis, and mitigation',
    category: 'business',
    icon: '⚠️',
    cells: [
      {
        cellId: 'A1',
        cellReference: 'A1',
        name: 'Project Scope',
        prompt: 'Define assessment scope:\n\nProject: [project]\nArea: [area]\nStakeholders: [stakeholders]\nTimeline: [timeline]',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.4,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: false,
        x: 100,
        y: 100
      },
      {
        cellId: 'B1',
        cellReference: 'B1',
        name: 'Risk Identification',
        prompt: 'Identify potential risks:\n\n{{A1}}\n\nCategorize by type (technical, financial, operational, etc.).',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 250
      },
      {
        cellId: 'C1',
        cellReference: 'C1',
        name: 'Risk Analysis',
        prompt: 'Analyze identified risks:\n\n{{B1}}\n\nAssess probability, impact, and severity.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.5,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 400
      },
      {
        cellId: 'D1',
        cellReference: 'D1',
        name: 'Mitigation Plan',
        prompt: 'Create risk mitigation strategies:\n\n{{C1}}\n\nPrevention, contingency, and response plans.',
        modelType: 'text',
        preferredModel: 'gpt-4o',
        temperature: 0.6,
        characterLimit: 0,
        outputFormat: 'markdown',
        autoRun: true,
        x: 100,
        y: 550
      }
    ]
  }
};

// Template categories
export const TEMPLATE_CATEGORIES = {
  content: { name: 'Content Creation', icon: '📝', color: 'blue' },
  marketing: { name: 'Marketing', icon: '📱', color: 'purple' },
  business: { name: 'Business', icon: '💼', color: 'green' },
  productivity: { name: 'Productivity', icon: '⚡', color: 'yellow' },
  education: { name: 'Education', icon: '🎓', color: 'indigo' },
  creative: { name: 'Creative', icon: '🎨', color: 'pink' },
  personal: { name: 'Personal', icon: '👤', color: 'orange' }
};

// Get templates by category
export function getTemplatesByCategory(category) {
  return Object.values(TEMPLATES).filter(t => t.category === category);
}

// Get all templates
export function getAllTemplates() {
  return Object.values(TEMPLATES);
}

// Get template by ID
export function getTemplateById(id) {
  return TEMPLATES[id];
}

