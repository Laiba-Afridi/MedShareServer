// Fix Network Error Permanently
const handleNetworkError = (error) => {
    console.error("Network Error:", error);
    return { message: "Network request failed. Please check your connection.", error: error.message };
  };