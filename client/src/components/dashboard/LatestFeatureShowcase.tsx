import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Timer, 
  QrCode, 
  Clock, 
  CheckCircle,
  ArrowRight,
  Wrench,
  Scan,
  Play,
  Pause,
  Download,
  Printer,
  BarChart3,
  FileText,
  Sparkles
} from 'lucide-react';
import { Link } from 'wouter';

const LatestFeatureShowcase: React.FC = () => {
  const newFeatures = [
    {
      title: 'Labor Time Tracking',
      description: 'Complete time tracking system with start/stop timers, manual entry, and detailed reporting',
      icon: Timer,
      status: 'new',
      highlights: [
        'Real-time timer with start/stop functionality',
        'Manual time entry with validation',
        'Session tracking and duration calculation',
        'Labor cost reporting and analytics',
        'Integration with work order lifecycle'
      ],
      route: '/work-orders',
      color: 'bg-violet-500',
      metrics: { value: 'Live', label: 'Time Tracking' },
      demoFeatures: [
        { icon: Play, text: 'Start timer from work order' },
        { icon: Pause, text: 'Automatic session management' },
        { icon: Clock, text: 'Manual time entry' },
        { icon: BarChart3, text: 'Labor cost analysis' }
      ]
    },
    {
      title: 'QR Code Generator',
      description: 'Professional QR code generation for equipment identification and asset tracking',
      icon: QrCode,
      status: 'new',
      highlights: [
        'Multiple QR code formats (PNG, SVG)',
        'Customizable size and error correction',
        'Equipment asset tag integration',
        'Print-ready format with text labels',
        'Batch generation capabilities'
      ],
      route: '/equipment',
      color: 'bg-indigo-500',
      metrics: { value: 'Ready', label: 'QR Generation' },
      demoFeatures: [
        { icon: QrCode, text: 'Generate equipment QR codes' },
        { icon: Download, text: 'Download in multiple formats' },
        { icon: Printer, text: 'Print-ready labels' },
        { icon: Scan, text: 'Mobile scanning support' }
      ]
    }
  ];

  return (
    <div className="mb-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 rounded-xl p-6 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-white/20 rounded-full p-2">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">New Features Released</h2>
              <p className="text-violet-100 mt-1">
                Labor Time Tracking and QR Code Generator now available
              </p>
            </div>
          </div>
          <Badge className="bg-white/20 text-white border-white/30">
            Latest Update
          </Badge>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {newFeatures.map((feature, index) => (
          <Card key={index} className="relative overflow-hidden border-2 hover:border-gray-300 transition-all duration-300 hover:shadow-lg">
            {/* Status Badge */}
            <div className="absolute top-4 right-4">
              <Badge className="bg-green-100 text-green-800 border-green-200">
                <CheckCircle className="w-3 h-3 mr-1" />
                {feature.status.toUpperCase()}
              </Badge>
            </div>

            <CardHeader className="pb-4">
              <div className="flex items-start space-x-4">
                <div className={`${feature.color} rounded-lg p-3 text-white`}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-xl text-gray-900">
                    {feature.title}
                  </CardTitle>
                  <p className="text-gray-600 mt-2 text-sm">
                    {feature.description}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Key Highlights */}
              <div className="space-y-2">
                <h4 className="font-semibold text-gray-800 text-sm">Key Features:</h4>
                <ul className="space-y-1">
                  {feature.highlights.slice(0, 3).map((highlight, idx) => (
                    <li key={idx} className="flex items-start text-sm text-gray-600">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      {highlight}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Demo Features */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-800 text-sm mb-3">Available Actions:</h4>
                <div className="grid grid-cols-2 gap-2">
                  {feature.demoFeatures.map((demo, idx) => (
                    <div key={idx} className="flex items-center text-xs text-gray-600">
                      <demo.icon className="w-3 h-3 mr-2 text-gray-500" />
                      {demo.text}
                    </div>
                  ))}
                </div>
              </div>

              {/* Metrics and Action */}
              <div className="flex items-center justify-between pt-2">
                <div className="text-center">
                  <div className={`text-lg font-bold ${feature.color.replace('bg-', 'text-')}`}>
                    {feature.metrics.value}
                  </div>
                  <div className="text-xs text-gray-500">
                    {feature.metrics.label}
                  </div>
                </div>
                
                <Link href={feature.route}>
                  <Button size="sm" className="group">
                    Try Now
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Access Bar */}
      <div className="mt-6 bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Timer className="w-5 h-5 text-violet-600" />
              <span className="font-medium text-gray-800">Labor Tracking:</span>
              <span className="text-sm text-gray-600">Start timing work orders with integrated stopwatch</span>
            </div>
            <div className="h-6 w-px bg-gray-300"></div>
            <div className="flex items-center space-x-2">
              <QrCode className="w-5 h-5 text-indigo-600" />
              <span className="font-medium text-gray-800">QR Codes:</span>
              <span className="text-sm text-gray-600">Generate equipment labels and asset tags</span>
            </div>
          </div>
          
          <div className="flex space-x-2">
            <Link href="/work-orders">
              <Button variant="outline" size="sm">
                <Wrench className="w-4 h-4 mr-2" />
                Work Orders
              </Button>
            </Link>
            <Link href="/equipment">
              <Button variant="outline" size="sm">
                <QrCode className="w-4 h-4 mr-2" />
                Equipment
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LatestFeatureShowcase;