import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Smartphone, 
  ShoppingCart, 
  BarChart3, 
  Wifi, 
  Camera, 
  Mic, 
  ArrowRight, 
  CheckCircle,
  Zap,
  TrendingUp
} from 'lucide-react';
import { Link } from 'wouter';

const Phase2FeatureShowcase: React.FC = () => {
  const features = [
    {
      title: 'Mobile-Optimized Checklist Execution',
      description: 'Touch-friendly interface with offline capabilities, voice-to-text, and photo capture',
      icon: Smartphone,
      status: 'implemented',
      highlights: [
        'Offline-first design with sync queue',
        'Voice-to-text for notes',
        'Camera integration for photos',
        'Progress tracking with haptic feedback'
      ],
      route: '/work-orders',
      color: 'bg-blue-500'
    },
    {
      title: 'Complete Parts Consumption Integration',
      description: 'Automatic inventory consumption with real-time stock alerts and reorder notifications',
      icon: ShoppingCart,
      status: 'implemented',
      highlights: [
        'Real-time inventory updates',
        'Automatic reorder point alerts',
        'Cost tracking and analysis',
        'Bulk consumption for work order completion'
      ],
      route: '/inventory',
      color: 'bg-green-500'
    },
    {
      title: 'Equipment Performance Analytics',
      description: 'MTBF, MTTR, availability metrics with reliability scoring and trend analysis',
      icon: BarChart3,
      status: 'implemented',
      highlights: [
        'MTBF/MTTR calculations',
        'Availability percentage tracking',
        'Reliability scoring (0-100)',
        'PM compliance monitoring'
      ],
      route: '/analytics',
      color: 'bg-purple-500'
    }
  ];

  const capabilities = [
    { icon: Wifi, label: 'Offline Support', description: 'Work without internet, sync when online' },
    { icon: Camera, label: 'Photo Capture', description: 'Attach photos directly from mobile camera' },
    { icon: Mic, label: 'Voice Notes', description: 'Speech-to-text for quick note taking' },
    { icon: Zap, label: 'Real-time Updates', description: 'Live notifications and sync' },
    { icon: TrendingUp, label: 'Advanced Analytics', description: 'Performance metrics and insights' },
    { icon: CheckCircle, label: 'Smart Automation', description: 'Automated inventory consumption' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center space-x-2">
            <Zap className="w-8 h-8" />
            <span>Phase 2: Enhanced Functionality</span>
            <Badge className="bg-green-500 text-white ml-2">✅ Complete</Badge>
          </CardTitle>
          <p className="text-blue-100 text-lg">
            Enterprise-ready features with mobile-first experience and advanced analytics
          </p>
        </CardHeader>
      </Card>

      {/* Main Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {features.map((feature, index) => (
          <Card key={index} className="relative overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className={`p-3 rounded-lg ${feature.color} text-white`}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <Badge variant="default" className="bg-green-100 text-green-800">
                  ✅ Live
                </Badge>
              </div>
              <CardTitle className="text-lg font-semibold mt-3">
                {feature.title}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {feature.description}
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2 mb-4">
                {feature.highlights.map((highlight, idx) => (
                  <div key={idx} className="flex items-center space-x-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span>{highlight}</span>
                  </div>
                ))}
              </div>
              <Link href={feature.route}>
                <Button className="w-full" variant="outline">
                  Try It Now
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Capabilities Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Enhanced Capabilities</CardTitle>
          <p className="text-muted-foreground">
            Advanced features that transform maintenance operations
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {capabilities.map((capability, index) => (
              <div key={index} className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <capability.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium text-sm">{capability.label}</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {capability.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Implementation Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="text-2xl font-bold text-green-600">100%</div>
            <div className="text-sm text-muted-foreground">Phase 2 Complete</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-2xl font-bold text-blue-600">3</div>
            <div className="text-sm text-muted-foreground">Major Features</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-2xl font-bold text-purple-600">6</div>
            <div className="text-sm text-muted-foreground">New Capabilities</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-2xl font-bold text-orange-600">Mobile</div>
            <div className="text-sm text-muted-foreground">Optimized</div>
          </CardContent>
        </Card>
      </div>

      {/* Next Steps */}
      <Card className="border-dashed border-2 border-muted">
        <CardContent className="p-6 text-center">
          <h3 className="text-lg font-semibold mb-2">Ready for Phase 3</h3>
          <p className="text-muted-foreground mb-4">
            Advanced features like offline PWA capabilities, performance optimization, and security hardening are next
          </p>
          <div className="flex justify-center space-x-2">
            <Badge variant="outline">PWA Ready</Badge>
            <Badge variant="outline">Security Hardening</Badge>
            <Badge variant="outline">Performance Optimization</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Phase2FeatureShowcase;