// Referenced from blueprint:javascript_object_storage
import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import Uppy from "@uppy/core";
import { DashboardModal } from "@uppy/react";
// TODO: Fix Vite CSS import issue
// import "@uppy/core/dist/style.min.css";
// import "@uppy/dashboard/dist/style.min.css";
import AwsS3 from "@uppy/aws-s3";
import type { UploadResult } from "@uppy/core";
import { Button } from "@/components/ui/button";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
    key?: string;
  }>;
  onComplete?: (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>
  ) => void;
  buttonClassName?: string;
  children: ReactNode;
}

/**
 * A file upload component that renders as a button and provides a modal interface for
 * file management.
 */
export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 52428800, // 50MB default
  onGetUploadParameters,
  onComplete,
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [uppy] = useState(() =>
    new Uppy({
      restrictions: {
        maxNumberOfFiles,
        maxFileSize,
      },
      autoProceed: false,
    })
      .use(AwsS3, {
        shouldUseMultipart: false,
        getUploadParameters: async (file) => {
          const params = await onGetUploadParameters();
          // Store the key in file meta so it's available in onComplete
          if (params.key) {
            file.meta.key = params.key;
          }
          return {
            method: params.method,
            url: params.url,
          };
        },
      })
      .on("complete", (result) => {
        onComplete?.(result);
        setShowModal(false);
      })
  );

  const handleOpenModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  return (
    <div>
      <Button 
        type="button"
        onClick={handleOpenModal}
        className={buttonClassName} 
        data-testid="button-upload-files"
      >
        {children}
      </Button>

      {showModal && (
        <DashboardModal
          uppy={uppy}
          open={showModal}
          onRequestClose={handleCloseModal}
          proudlyDisplayPoweredByUppy={false}
          closeModalOnClickOutside={true}
          disablePageScrollWhenModalOpen={true}
          animateOpenClose={false}
        />
      )}
    </div>
  );
}
