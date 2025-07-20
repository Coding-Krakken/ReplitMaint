import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  Building2, Users, FileText, Star, Phone, Mail, MapPin, 
  Calendar, DollarSign, TrendingUp, AlertTriangle, CheckCircle,
  Upload, Download, Eye, Edit, Trash2, Plus
} from 'lucide-react';
import { FileUpload } from '@/components/FileUpload';

interface Vendor {
  id: string;
  name: string;
  type: 'supplier' | 'contractor';
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  status: 'active' | 'inactive' | 'pending';
  rating: number;
  certifications: string[];
  services: string[];
  contractValue: number;
  workOrdersCompleted: number;
  averageResponseTime: number;
  onTimePerformance: number;
  qualityScore: number;
  lastContractDate?: string;
  nextReviewDate?: string;
  specializations: string[];
  preferredVendor: boolean;
  notes: string;
}

interface VendorPerformance {
  vendorId: string;
  period: string;
  workOrdersAssigned: number;
  workOrdersCompleted: number;
  averageCompletionTime: number;
  qualityRating: number;
  costEfficiency: number;
  onTimeDelivery: number;
  customerSatisfaction: number;
}

interface VendorDocument {
  id: string;
  vendorId: string;
  name: string;
  type: 'contract' | 'certification' | 'insurance' | 'sds' | 'other';
  fileUrl: string;
  uploadedAt: string;
  expiryDate?: string;
  status: 'active' | 'expired' | 'pending_renewal';
}

const EnhancedVendorManagement: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | 'view'>('create');
  const [filterType, setFilterType] = useState<'all' | 'supplier' | 'contractor'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'pending'>('all');

  // Fetch vendors
  const { data: vendors = [], isLoading } = useQuery<Vendor[]>({
    queryKey: ['vendors', filterType, filterStatus],
    queryFn: () => fetch(`/api/vendors?type=${filterType}&status=${filterStatus}`).then(res => res.json()),
  });

  // Fetch vendor performance data
  const { data: vendorPerformance = [] } = useQuery<VendorPerformance[]>({
    queryKey: ['vendor-performance'],
    queryFn: () => fetch('/api/vendors/performance').then(res => res.json()),
  });

  // Fetch vendor documents
  const { data: vendorDocuments = [] } = useQuery<VendorDocument[]>({
    queryKey: ['vendor-documents'],
    queryFn: () => fetch('/api/vendors/documents').then(res => res.json()),
  });

  // Create/Update vendor mutation
  const vendorMutation = useMutation({
    mutationFn: (data: Partial<Vendor>) => {
      const url = data.id ? `/api/vendors/${data.id}` : '/api/vendors';
      const method = data.id ? 'PUT' : 'POST';
      return fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setIsDialogOpen(false);
      toast({
        title: 'Success',
        description: selectedVendor ? 'Vendor updated successfully' : 'Vendor created successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save vendor',
        variant: 'destructive',
      });
    },
  });

  const handleOpenDialog = (mode: 'create' | 'edit' | 'view', vendor?: Vendor) => {
    setDialogMode(mode);
    setSelectedVendor(vendor || null);
    setIsDialogOpen(true);
  };

  const handleSaveVendor = (data: Partial<Vendor>) => {
    vendorMutation.mutate(data);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case 'inactive': return <Badge className="bg-gray-100 text-gray-800">Inactive</Badge>;
      case 'pending': return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPerformanceColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-blue-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getRatingStars = (rating: number) => {
    return [...Array(5)].map((_, i) => (
      <Star 
        key={i} 
        className={`w-4 h-4 ${i < rating ? 'text-yellow-500 fill-current' : 'text-gray-300'}`}
      />
    ));
  };

  // Calculate summary metrics
  const summaryMetrics = {
    totalVendors: vendors.length,
    activeVendors: vendors.filter(v => v.status === 'active').length,
    contractors: vendors.filter(v => v.type === 'contractor').length,
    suppliers: vendors.filter(v => v.type === 'supplier').length,
    averageRating: vendors.length > 0 ? vendors.reduce((sum, v) => sum + v.rating, 0) / vendors.length : 0,
    totalContractValue: vendors.reduce((sum, v) => sum + v.contractValue, 0),
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-20 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Vendors</p>
                <p className="text-2xl font-bold text-blue-600">{summaryMetrics.totalVendors}</p>
                <p className="text-xs text-gray-500">{summaryMetrics.activeVendors} active</p>
              </div>
              <Building2 className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Contractors</p>
                <p className="text-2xl font-bold text-green-600">{summaryMetrics.contractors}</p>
                <p className="text-xs text-gray-500">Service providers</p>
              </div>
              <Users className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Suppliers</p>
                <p className="text-2xl font-bold text-purple-600">{summaryMetrics.suppliers}</p>
                <p className="text-xs text-gray-500">Parts & materials</p>
              </div>
              <FileText className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Contract Value</p>
                <p className="text-2xl font-bold text-orange-600">
                  ${summaryMetrics.totalContractValue.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">Total active contracts</p>
              </div>
              <DollarSign className="w-8 h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Vendor Management</CardTitle>
            <div className="flex items-center space-x-4">
              {/* Filters */}
              <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="supplier">Suppliers</SelectItem>
                  <SelectItem value="contractor">Contractors</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>

              <Button onClick={() => handleOpenDialog('create')}>
                <Plus className="w-4 h-4 mr-2" />
                Add Vendor
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="vendors" className="space-y-6">
            <TabsList>
              <TabsTrigger value="vendors">Vendors</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="contracts">Contracts</TabsTrigger>
            </TabsList>

            <TabsContent value="vendors" className="space-y-4">
              <div className="grid gap-4">
                {vendors.map((vendor) => (
                  <Card key={vendor.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-4">
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            {vendor.type === 'contractor' ? 
                              <Users className="w-6 h-6 text-blue-600" /> :
                              <Building2 className="w-6 h-6 text-blue-600" />
                            }
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <h3 className="font-semibold text-lg">{vendor.name}</h3>
                              {vendor.preferredVendor && (
                                <Badge className="bg-gold-100 text-gold-800">Preferred</Badge>
                              )}
                              {getStatusBadge(vendor.status)}
                            </div>
                            
                            <div className="flex items-center space-x-1">
                              {getRatingStars(vendor.rating)}
                              <span className="text-sm text-gray-600 ml-2">({vendor.rating}/5)</span>
                            </div>
                            
                            <div className="flex items-center space-x-4 text-sm text-gray-600">
                              <div className="flex items-center space-x-1">
                                <Mail className="w-4 h-4" />
                                <span>{vendor.email}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <Phone className="w-4 h-4" />
                                <span>{vendor.phone}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <MapPin className="w-4 h-4" />
                                <span>{vendor.address}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleOpenDialog('view', vendor)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleOpenDialog('edit', vendor)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Performance Metrics */}
                      <div className="mt-4 grid grid-cols-4 gap-4 pt-4 border-t">
                        <div className="text-center">
                          <div className={`text-lg font-semibold ${getPerformanceColor(vendor.onTimePerformance)}`}>
                            {vendor.onTimePerformance}%
                          </div>
                          <div className="text-xs text-gray-500">On-Time</div>
                        </div>
                        <div className="text-center">
                          <div className={`text-lg font-semibold ${getPerformanceColor(vendor.qualityScore)}`}>
                            {vendor.qualityScore}%
                          </div>
                          <div className="text-xs text-gray-500">Quality</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-blue-600">
                            {vendor.workOrdersCompleted}
                          </div>
                          <div className="text-xs text-gray-500">Completed</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-green-600">
                            ${vendor.contractValue.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-500">Contract Value</div>
                        </div>
                      </div>

                      {/* Services/Specializations */}
                      {vendor.services.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <div className="flex flex-wrap gap-2">
                            {vendor.services.slice(0, 3).map((service, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {service}
                              </Badge>
                            ))}
                            {vendor.services.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{vendor.services.length - 3} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {vendors.length === 0 && (
                  <div className="text-center py-12">
                    <Building2 className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold text-gray-600 mb-2">No Vendors Found</h3>
                    <p className="text-gray-500">Get started by adding your first vendor.</p>
                    <Button className="mt-4" onClick={() => handleOpenDialog('create')}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Vendor
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="performance" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Vendor Performance Analytics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12 text-muted-foreground">
                    <TrendingUp className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-semibold mb-2">Performance Analytics</h3>
                    <p>Detailed vendor performance analytics coming soon...</p>
                    <p className="text-sm mt-2">
                      This will include cost analysis, quality metrics, and delivery performance.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Document Management</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {vendorDocuments.slice(0, 5).map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          <FileText className="w-8 h-8 text-blue-600" />
                          <div>
                            <h4 className="font-medium">{doc.name}</h4>
                            <p className="text-sm text-gray-600">Type: {doc.type}</p>
                            <p className="text-xs text-gray-500">Uploaded: {doc.uploadedAt}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge 
                            variant={doc.status === 'active' ? 'default' : 'destructive'}
                            className="text-xs"
                          >
                            {doc.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                          <Button variant="ghost" size="sm">
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    
                    {vendorDocuments.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <h3 className="text-lg font-semibold mb-2">No Documents</h3>
                        <p>Vendor documents will appear here when uploaded.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="contracts" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Contract Management</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-semibold mb-2">Contract Management</h3>
                    <p>Advanced contract management features coming soon...</p>
                    <p className="text-sm mt-2">
                      This will include contract lifecycle management, renewal tracking, and compliance monitoring.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Vendor Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'create' ? 'Add New Vendor' :
               dialogMode === 'edit' ? 'Edit Vendor' : 'Vendor Details'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Vendor Name</label>
                <Input 
                  placeholder="Enter vendor name"
                  defaultValue={selectedVendor?.name}
                  disabled={dialogMode === 'view'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Type</label>
                <Select defaultValue={selectedVendor?.type} disabled={dialogMode === 'view'}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supplier">Supplier</SelectItem>
                    <SelectItem value="contractor">Contractor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Contact Information */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Contact Person</label>
                <Input 
                  placeholder="Contact person name"
                  defaultValue={selectedVendor?.contactPerson}
                  disabled={dialogMode === 'view'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <Input 
                  type="email"
                  placeholder="email@example.com"
                  defaultValue={selectedVendor?.email}
                  disabled={dialogMode === 'view'}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Phone</label>
                <Input 
                  placeholder="Phone number"
                  defaultValue={selectedVendor?.phone}
                  disabled={dialogMode === 'view'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <Select defaultValue={selectedVendor?.status} disabled={dialogMode === 'view'}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium mb-2">Address</label>
              <Textarea 
                placeholder="Full address"
                defaultValue={selectedVendor?.address}
                disabled={dialogMode === 'view'}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium mb-2">Notes</label>
              <Textarea 
                placeholder="Additional notes"
                defaultValue={selectedVendor?.notes}
                disabled={dialogMode === 'view'}
              />
            </div>

            {/* Document Upload */}
            {dialogMode !== 'view' && (
              <div>
                <label className="block text-sm font-medium mb-2">Upload Documents</label>
                <FileUpload
                  vendorId={selectedVendor?.id}
                  onUploadSuccess={(url, fileName) => {
                    toast({
                      title: 'Document Uploaded',
                      description: `${fileName} uploaded successfully`,
                    });
                  }}
                  onUploadError={(error) => {
                    toast({
                      title: 'Upload Failed',
                      description: error,
                      variant: 'destructive',
                    });
                  }}
                />
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end space-x-4 pt-4 border-t">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              {dialogMode !== 'view' && (
                <Button onClick={() => handleSaveVendor(selectedVendor || {})}>
                  {dialogMode === 'create' ? 'Create Vendor' : 'Update Vendor'}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EnhancedVendorManagement;