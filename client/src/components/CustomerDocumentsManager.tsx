import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Plus, Pencil, Trash2, ExternalLink, GripVertical } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { CustomerDocument } from "@shared/schema";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "pricing", label: "Pricing" },
  { value: "policies", label: "Policies" },
  { value: "guides", label: "Guides" },
] as const;

const documentFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  driveUrl: z.string().url("Must be a valid URL"),
  category: z.string().default("general"),
  sortOrder: z.coerce.number().default(0),
  active: z.boolean().default(true),
});

type DocumentFormData = z.infer<typeof documentFormSchema>;

interface DocumentFormDialogProps {
  document?: CustomerDocument;
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

function DocumentFormDialog({ document, trigger, onSuccess }: DocumentFormDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const isEditing = !!document;

  const form = useForm<DocumentFormData>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: {
      title: document?.title || "",
      description: document?.description || "",
      driveUrl: document?.driveUrl || "",
      category: document?.category || "general",
      sortOrder: document?.sortOrder || 0,
      active: document?.active ?? true,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: DocumentFormData) => {
      const response = await apiRequest("POST", "/api/customer-documents", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-documents"] });
      toast({ title: "Document added successfully" });
      setOpen(false);
      form.reset();
      onSuccess?.();
    },
    onError: () => {
      toast({ title: "Failed to add document", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: DocumentFormData) => {
      const response = await apiRequest("PATCH", `/api/customer-documents/${document!.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-documents"] });
      toast({ title: "Document updated successfully" });
      setOpen(false);
      onSuccess?.();
    },
    onError: () => {
      toast({ title: "Failed to update document", variant: "destructive" });
    },
  });

  const onSubmit = (data: DocumentFormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Document" : "Add Document"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="e.g., 2026 Price List"
                      data-testid="input-doc-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      placeholder="Brief description of this document..."
                      className="resize-none"
                      data-testid="input-doc-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="driveUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Google Drive Link</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="https://drive.google.com/..."
                      data-testid="input-doc-url"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-doc-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="number"
                        data-testid="input-doc-sort"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Active</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Only active documents are visible to customers
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-doc-active"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-doc-submit">
                {isPending ? "Saving..." : isEditing ? "Update" : "Add Document"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface CustomerDocumentsManagerProps {
  trigger: React.ReactNode;
}

export function CustomerDocumentsManager({ trigger }: CustomerDocumentsManagerProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const { data: documents = [], isLoading } = useQuery<CustomerDocument[]>({
    queryKey: ["/api/customer-documents"],
    enabled: open,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/customer-documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-documents"] });
      toast({ title: "Document deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete document", variant: "destructive" });
    },
  });

  const handleDelete = (doc: CustomerDocument) => {
    if (window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) {
      deleteMutation.mutate(doc.id);
    }
  };

  const getCategoryLabel = (value: string | null) => {
    const cat = CATEGORIES.find(c => c.value === value);
    return cat?.label || "General";
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Customer Documents
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Add Google Drive links that will be visible to all customers in their portal.
            </p>
            <DocumentFormDialog
              trigger={
                <Button size="sm" data-testid="button-add-document">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Document
                </Button>
              }
            />
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No documents added yet. Add your first document to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <Card key={doc.id} className={!doc.active ? "opacity-60" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{doc.title}</span>
                          <Badge variant="outline" className="text-xs">
                            {getCategoryLabel(doc.category)}
                          </Badge>
                          {!doc.active && (
                            <Badge variant="secondary" className="text-xs">
                              Hidden
                            </Badge>
                          )}
                        </div>
                        {doc.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {doc.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <a 
                            href={doc.driveUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View Document
                          </a>
                          <span>Added {format(new Date(doc.createdAt), "dd MMM yyyy")}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <DocumentFormDialog
                          document={doc}
                          trigger={
                            <Button variant="ghost" size="icon" data-testid={`button-edit-doc-${doc.id}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDelete(doc)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-doc-${doc.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
