const $ = (id) => document.getElementById(id);

const input = $("imageInput");
const tabs = document.querySelectorAll(".tab");

let mode = "compress";
let originalImage = null;
let originalFile = null;
let originalUrl = null;
let resultUrl = null;
let lastDimensionEdited = "width";

const formatSelect = $("format");
const quality = $("quality");

function setStatus(message) {
  $("status").textContent = message;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + " KB";
  }
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function clearResult() {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null;

  $("resultPreview").removeAttribute("src");
  $("resultInfo").textContent = "";
  $("result").classList.add("hidden");
  $("downloadButton").removeAttribute("href");
}

function clearImage() {
  if (originalUrl) URL.revokeObjectURL(originalUrl);
  originalUrl = null;
  originalImage = null;
  originalFile = null;

  $("originalPreview").removeAttribute("src");
  $("originalInfo").textContent = "";

  clearResult();

  $("width").value = "";
  $("height").value = "";

  input.value = "";
  $("processButton").disabled = true;
  $("processButton").textContent = "Choose an image first";

  setStatus("Choose an image to get started.");
}

function updateMode() {
  tabs.forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });

  $("formatGroup").classList.toggle("hidden", mode === "resize");
  $("qualityGroup").classList.toggle("hidden", mode !== "compress");

  $("widthGroup").classList.toggle("hidden", mode !== "resize");
  $("heightGroup").classList.toggle("hidden", mode !== "resize");
  $("ratioGroup").classList.toggle("hidden", mode !== "resize");

  const labels = {
    compress: "Compress image",
    resize: "Resize image",
    convert: "Convert image"
  };

  $("processButton").textContent =
    originalImage ? labels[mode] + " →" : "Choose an image first";

  clearResult();
  if (originalImage) {
    setStatus("Adjust your settings, then process the image.");
  }
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    mode = tab.dataset.mode;
    updateMode();
  });
});

quality.addEventListener("input", () => {
  $("qualityValue").textContent = quality.value + "%";
});

$("width").addEventListener("input", () => {
  lastDimensionEdited = "width";
});

$("height").addEventListener("input", () => {
  lastDimensionEdited = "height";
});

input.addEventListener("change", () => {
  clearResult();

  const file = input.files && input.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    setStatus("Please select a valid image file.");
    input.value = "";
    return;
  }

  if (file.size > 30 * 1024 * 1024) {
    setStatus("Please select an image smaller than 30 MB.");
    input.value = "";
    return;
  }

  setStatus("Loading image…");

  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);

    originalUrl = url;
    originalImage = img;
    originalFile = file;

    $("originalPreview").src = originalUrl;
    $("originalInfo").textContent =
      `${img.naturalWidth} × ${img.naturalHeight} px · ${formatBytes(file.size)}`;

    $("width").value = img.naturalWidth;
    $("height").value = img.naturalHeight;

    $("processButton").disabled = false;
    $("processButton").textContent =
      ({
        compress: "Compress image →",
        resize: "Resize image →",
        convert: "Convert image →"
      })[mode];

    setStatus("Image ready. Your original file will not be modified.");
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus("Could not open this image. Please try another file.");
    input.value = "";
  };

  img.src = url;
});

$("processButton").addEventListener("click", async () => {
  if (!originalImage || !originalFile) {
    setStatus("Please choose an image first.");
    return;
  }

  let width = originalImage.naturalWidth;
  let height = originalImage.naturalHeight;

  if (mode === "resize") {
    width = Number($("width").value);
    height = Number($("height").value);

    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > 12000 ||
      height > 12000
    ) {
      setStatus("Enter valid dimensions between 1 and 12,000 pixels.");
      return;
    }

    if ($("keepRatio").checked) {
      const ratio =
        originalImage.naturalWidth / originalImage.naturalHeight;

      if (lastDimensionEdited === "width") {
        height = Math.max(1, Math.round(width / ratio));
        $("height").value = height;
      } else {
        width = Math.max(1, Math.round(height * ratio));
        $("width").value = width;
      }

      if (width > 12000 || height > 12000) {
        setStatus("These dimensions exceed the 12,000-pixel limit.");
        return;
      }
    }
  }

  const outputType =
    mode === "resize" ? "image/png" : formatSelect.value;

  if (!["image/jpeg", "image/png", "image/webp"].includes(outputType)) {
    setStatus("Please choose JPG, PNG, or WebP.");
    return;
  }

  $("processButton").disabled = true;
  setStatus("Processing image…");

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");

    if (!ctx) throw new Error("Canvas is not supported.");

    if (outputType === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(originalImage, 0, 0, width, height);

    const outputBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("The browser could not create the image."));
        },
        outputType,
        Number(quality.value) / 100
      );
    });

    if (outputBlob.type !== outputType) {
      throw new Error("This image format is not supported by your browser.");
    }

    clearResult();

    resultUrl = URL.createObjectURL(outputBlob);
    $("resultPreview").src = resultUrl;

    let info =
      `${width} × ${height} px · ${formatBytes(outputBlob.size)}`;

    if (mode === "compress") {
      const difference =
        Math.round((1 - outputBlob.size / originalFile.size) * 100);

      info += difference >= 0
        ? ` · ${difference}% smaller`
        : ` · ${Math.abs(difference)}% larger`;
    }

    $("resultInfo").textContent = info;
    $("result").classList.remove("hidden");

    const extension = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    }[outputType];

    const filename = originalFile.name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9_-]/gi, "-");

    const link = $("downloadButton");
    link.href = resultUrl;
    link.download = `${filename}-${mode}.${extension}`;

    setStatus("Done! Your image is ready to download.");
    $("result").scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
  } catch (error) {
    setStatus(error.message || "Something went wrong. Try another image.");
  } finally {
    $("processButton").disabled = false;
    $("processButton").textContent =
      ({
        compress: "Compress image →",
        resize: "Resize image →",
        convert: "Convert image →"
      })[mode];
  }
});

$("resetButton").addEventListener("click", clearImage);

$("year").textContent = new Date().getFullYear();

updateMode();