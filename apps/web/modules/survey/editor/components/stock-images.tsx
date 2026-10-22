"use client";

import { SearchIcon } from "lucide-react";
import StockImage from "next/image";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { TSurveyBackgroundBgType } from "@forms/types/surveys/types";
import { isExternalImageSrc } from "@/lib/image-hosts";
import { debounce } from "@/lib/utils/debounce";
import { Input } from "@/modules/ui/components/input";
import { LoadingSpinner } from "@/modules/ui/components/loading-spinner";
import { searchStockImagesAction } from "../actions";

interface StockImagesProps {
  handleBgChange: (url: string, bgType: TSurveyBackgroundBgType) => void;
}

interface StockImage {
  id: string;
  alt_description: string;
  urls: {
    regularWithAttribution: string;
    download?: string;
  };
  authorName?: string;
}

const defaultImages = [
  {
    id: "dog-1",
    alt_description: "Dog",
    urls: {
      regularWithAttribution: "/image-backgrounds/dogs.webp",
    },
  },
  {
    id: "pencil",
    alt_description: "Pencil",
    urls: {
      regularWithAttribution: "/image-backgrounds/pencil.webp",
    },
  },
  {
    id: "plant",
    alt_description: "Plant",
    urls: {
      regularWithAttribution: "/image-backgrounds/plant.webp",
    },
  },
  {
    id: "dog-2",
    alt_description: "Another Dog",
    urls: {
      regularWithAttribution: "/image-backgrounds/dog-2.webp",
    },
  },
  {
    id: "kitten-2",
    alt_description: "Another Kitten",
    urls: {
      regularWithAttribution: "/image-backgrounds/kitten-2.webp",
    },
  },
  {
    id: "lollipop",
    alt_description: "Lollipop",
    urls: {
      regularWithAttribution: "/image-backgrounds/lolipop.webp",
    },
  },
  {
    id: "oranges",
    alt_description: "Oranges",
    urls: {
      regularWithAttribution: "/image-backgrounds/oranges.webp",
    },
  },
  {
    id: "flower",
    alt_description: "Flower",
    urls: {
      regularWithAttribution: "/image-backgrounds/flowers.webp",
    },
  },
  {
    id: "supermario",
    alt_description: "Super Mario",
    urls: {
      regularWithAttribution: "/image-backgrounds/supermario.webp",
    },
  },
  {
    id: "shapes",
    alt_description: "Shapes",
    urls: {
      regularWithAttribution: "/image-backgrounds/shapes.webp",
    },
  },
  {
    id: "waves",
    alt_description: "Waves",
    urls: {
      regularWithAttribution: "/image-backgrounds/waves.webp",
    },
  },
  {
    id: "kitten-1",
    alt_description: "Kitten",
    urls: {
      regularWithAttribution: "/image-backgrounds/kittens.webp",
    },
  },
  {
    id: "windows",
    alt_description: "Windows",
    urls: {
      regularWithAttribution: "/image-backgrounds/windows.webp",
    },
  },
];

export const StockImages = ({ handleBgChange }: StockImagesProps) => {
  const { t } = useTranslation();
  const inputFocus = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [images, setImages] = useState<StockImage[]>(defaultImages);

  useEffect(() => {
    const fetchData = async (searchQuery: string) => {
      try {
        setIsLoading(true);
        const searchStockImagesResponse = await searchStockImagesAction({
          searchQuery: searchQuery,
        });
        if (!searchStockImagesResponse?.data) return;

        const stockImages = searchStockImagesResponse.data;
        setImages(stockImages);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unknown error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    const debouncedFetchData = debounce((q) => fetchData(q), 500);

    if (query.trim() !== "") {
      debouncedFetchData(query);
    }

    return () => {
      debouncedFetchData.cancel();
    };
  }, [query]);

  useEffect(() => {
    inputFocus.current?.focus();
  }, []);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    setImages(event.target.value.trim() ? [] : defaultImages);
  };

  const handleImageSelected = async (imageUrl: string) => {
    try {
      handleBgChange(imageUrl, "image");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unknown error occurred");
    }
  };

  return (
    <div className="relative mt-2 w-full">
      <div className="relative">
        <SearchIcon className="absolute top-1/2 left-2 h-6 w-4 -translate-y-1/2 text-slate-500" />
        <Input
          value={query}
          onChange={handleChange}
          placeholder={t("workspace.surveys.edit.try_lollipop_or_mountain")}
          className="pl-8"
          ref={inputFocus}
          aria-label={t("workspace.surveys.edit.search_for_images")}
        />
      </div>
      <div className="relative mt-4 grid grid-cols-3 gap-1">
        {images.length > 0 &&
          images.map((image) => (
            <div key={image.id} className="group relative">
              <StockImage
                width={300}
                height={200}
                src={image.urls.regularWithAttribution}
                alt={image.alt_description}
                onClick={() => handleImageSelected(image.urls.regularWithAttribution)}
                className="h-full cursor-pointer rounded-lg object-cover"
                unoptimized={isExternalImageSrc(image.urls.regularWithAttribution)}
              />
              {image.authorName && (
                <span className="absolute right-1 bottom-1 hidden rounded-sm bg-black/75 px-2 py-1 text-xs text-white group-hover:block">
                  {image.authorName}
                </span>
              )}
            </div>
          ))}
        {isLoading && (
          <div className="col-span-3 flex items-center justify-center p-3">
            <LoadingSpinner />
          </div>
        )}
        {!isLoading && images.length === 0 && query.trim() !== "" && (
          <div className="col-span-3 flex items-center justify-center text-sm text-slate-500">
            {t("workspace.surveys.edit.no_images_found_for", { query: query })}
          </div>
        )}
      </div>
    </div>
  );
};
