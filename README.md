# Superfan - Music Collaboration Platform

## Overview

Superfan is a next-generation music collaboration and funding platform that connects artists with fans and investors. The platform enables artists to launch music projects, secure funding, and distribute revenue shares to collaborators and backers.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript
- **Styling**: Tailwind CSS, Framer Motion for animations
- **Authentication**: Custom auth with wallet integration
- **State Management**: React Context API
- **Data Storage**: Local storage (demo), prepared for Supabase integration

## Features

- **Artist Project Creation**: Launch music projects with detailed information
- **Team Collaboration**: Define team members and revenue splits
- **Funding Mechanism**: Set funding goals and allocate revenue percentages to backers
- **Presale Projects**: Projects in funding phase with investment opportunities
- **Explore Section**: Discover published projects with trading capabilities (only published projects are visible to all users)
- **Project Review Process**: New projects go through a pending review process before being published and visible in Explore
- **Interactive Audio Player**: Preview demo tracks with waveform visualization
- **Mobile-First Design**: Responsive UI optimized for all devices
- **Trade Modal**: Buy and sell tokens with intuitive swipe mechanism

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- Git

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/your-username/superfan.git
   cd superfan
   ```

2. Install dependencies:

   ```bash
   npm install
   # or
   yarn install
   ```

3. Set up environment variables (see Environment Variables section below)

4. Run the development server:

   ```bash
   npm run dev
   # or
   yarn dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

For development, you can pull environment variables directly from Vercel:

```bash
# Install Vercel CLI if you haven't already
npm install -g vercel

# Link your local project to the Vercel project
vercel link

# Pull environment variables from Vercel
vercel env pull .env.local
```

Alternatively, create a `.env.local` file manually with the following variables:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
```

## Project Structure

```
superfan/
├── app/                    # Next.js App Router pages
│   ├── dashboard/          # Dashboard page
│   ├── launch/             # Project creation flow
│   ├── login/              # Authentication
│   ├── moonpay-test/       # MoonPay integration testing
│   ├── profile/            # User profile
│   ├── review/             # Project review pages
│   │   └── [projectId]/    # Dynamic project review page
│   ├── your-projects/      # User's projects page
│   ├── layout.tsx          # Root layout
│   ├── providers.tsx       # App providers
│   ├── page.tsx            # Home page
│   ├── fonts.ts            # Font configurations
│   └── globals.css         # Global styles
├── components/             # React components
│   ├── ui/                 # UI components (shadcn/ui)
│   │   ├── accordion.tsx   # Accordion component
│   │   ├── alert.tsx       # Alert component
│   │   ├── avatar.tsx      # Avatar component
│   │   ├── badge.tsx       # Badge component
│   │   ├── button.tsx      # Button component
│   │   ├── card.tsx        # Card component
│   │   ├── dialog.tsx      # Dialog component
│   │   ├── form.tsx        # Form component
│   │   ├── input.tsx       # Input component
│   │   ├── select.tsx      # Select component
│   │   ├── sheet.tsx       # Sheet component
│   │   ├── sidebar.tsx     # Sidebar component
│   │   ├── spinner.tsx     # Loading spinner
│   │   ├── tabs.tsx        # Tabs component
│   │   ├── toast.tsx       # Toast notifications
│   │   └── ...             # Other UI components
│   ├── empty-state.tsx     # Empty state component
│   ├── financing-form.tsx  # Project financing form
│   ├── fund-modal.tsx      # Project funding modal
│   ├── header.tsx          # App header component
│   ├── launch-form.tsx     # Project launch form
│   ├── logo.tsx            # Logo component
│   ├── profile-settings.tsx # Profile settings form
│   ├── project-card.tsx    # Project card component
│   ├── project-details-modal.tsx # Project details modal
│   ├── project-list-item.tsx # Project list item
│   ├── review-project.tsx  # Project review component
│   ├── team-splits-form.tsx # Team revenue splits form
│   ├── theme-provider.tsx  # Theme provider
│   ├── trade-modal.tsx     # Token trading modal
│   ├── UserAgreementWarning.tsx # User agreement warning
│   └── wallet-settings.tsx # Wallet settings component
├── hooks/                  # Custom React hooks
│   ├── use-mobile.tsx      # Mobile detection hook
│   └── use-toast.ts        # Toast notifications hook
├── lib/                    # Utility functions and contexts
│   ├── audio-player-context.tsx # Audio player context
│   ├── auth-context.tsx    # Authentication context
│   ├── supabase.ts         # Supabase client configuration
│   └── utils.ts            # Helper functions and utilities
├── public/                 # Static assets
│   ├── placeholder-logo.png # Placeholder logo image
│   ├── placeholder-logo.svg # Placeholder logo SVG
│   ├── placeholder-user.jpg # Placeholder user image
│   ├── placeholder.jpg     # General placeholder image
│   └── placeholder.svg     # General placeholder SVG
├── styles/                 # Additional styles
│   └── globals.css         # Global CSS styles
├── types/                  # TypeScript type definitions
│   └── project.ts          # Project-related types
├── components.json         # shadcn/ui configuration
├── next.config.mjs         # Next.js configuration
├── package.json            # Dependencies and scripts
├── tailwind.config.ts      # Tailwind CSS configuration
└── tsconfig.json           # TypeScript configuration
```

## Key Components

### Authentication Flow

The app uses a custom authentication system with email and wallet connection options. The auth state is managed through the `AuthContext` provider.

```typescript
// Example usage of auth context
import { useAuth } from "@/lib/auth-context";

function MyComponent() {
  const { authenticated, login, logout, user } = useAuth();

  // Use auth state and methods
}
```

### Project Creation Flow

The project creation process is a multi-step form:

1. **Project Information**: Basic details about the music project
2. **Team Splits**: Define collaborators and revenue distribution
3. **Financing**: Set funding goals and backer allocations
4. **Review**: Final review before publishing

### Data Models

#### Project

```typescript
interface Project {
  id: string;
  title: string;
  creatorName: string;
  description?: string;
  releaseDate?: string;
  fileUrl?: string;
  artworkUrl?: string;
  demoUrl?: string;
  createdAt: string;
  completed?: boolean;
  teamMembers?: TeamMember[];
  fundingSettings?: FundingSettings;
  fundingAmount?: number | null;
}
```

#### Team Member

```typescript
interface TeamMember {
  id: string;
  role: string;
  name: string;
  email: string;
  walletAddress: string;
  revenueShare: number;
}
```

## Blockchain Integration

The app is designed to integrate with blockchain technology for:

- Wallet authentication
- Token creation for funded projects
- Revenue distribution based on smart contracts

Current implementation uses mock data, but the architecture is prepared for blockchain integration.

## Deployment

### Vercel Deployment

1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy with default settings

### Manual Deployment

1. Build the application:

   ```bash
   npm run build
   # or
   yarn build
   ```

2. Start the production server:
   ```bash
   npm start
   # or
   yarn start
   ```

## Future Roadmap

- **Supabase Integration**: Replace local storage with Supabase database
- **Smart Contract Integration**: Implement actual blockchain functionality
- **File Upload**: Add real file upload for artwork and audio
- **Analytics Dashboard**: Provide insights for artists and investors
- **Mobile App**: Develop native mobile applications
- **Social Features**: Add commenting, sharing, and following capabilities

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add some amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contact

For questions or support, please contact the development team at dev@superfan.io.
