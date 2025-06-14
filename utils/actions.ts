"use server";

import db from "@/utils/db";
import { currentUser, auth } from "@clerk/nextjs/server";
import { error, log } from "console";
import { redirect } from "next/navigation";
import { use } from "react";
import {
  imageSchema,
  productSchema,
  reviewSchema,
  validateWithZodSchema,
} from "./schemas";
import { deleteImage, uploadImage } from "./supabase";
import { revalidatePath } from "next/cache";
import { Cart, Product } from "@prisma/client";
import Rating from "@/components/reviews/Rating";
import { create } from "domain";

const getAuthUser = async () => {
  const user = await currentUser();
  if (!user) redirect("/");
  return user;
};

// action
const getAdminUser = async () => {
  const user = await getAuthUser();
  if (user.id !== process.env.ADMIN_USER_ID) redirect("/");
  return user;
};

const renderError = (error: unknown): { message: string } => {
  console.log(error);
  return {
    message: error instanceof Error ? error.message : "an error occurred",
  };
};

export const fetchFeaturedProducts = async () => {
  const products = await db.product.findMany({
    where: {
      featured: true,
    },
  });
  return products;
};

// export const fetchAllProducts = ({ search = "" }: { search: string }) => {
//   return db.product.findMany({
//     where: {
//       OR: [
//         { name: { contains: search, mode: "insensitive" } },
//         { company: { contains: search, mode: "insensitive" } },
//       ],
//     },
//     orderBy: {
//       createdAt: "desc",
//     },
//   });
// };

export const fetchAllProducts = async ({
  search = "",
  page = 1,
  perPage = 12,
}: {
  search: string;
  page?: number;
  perPage?: number;
}) => {
  const skip = (page - 1) * perPage;

  const [products, totalProducts] = await Promise.all([
    db.product.findMany({
      where: {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { company: { contains: search, mode: "insensitive" } },
        ],
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: perPage,
    }),
    db.product.count({
      where: {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { company: { contains: search, mode: "insensitive" } },
        ],
      },
    }),
  ]);

  return {
    products,
    totalProducts,
    totalPages: Math.ceil(totalProducts / perPage),
  };
};

export const fetchSingleProduct = async (productId: string) => {
  const product = await db.product.findUnique({
    where: {
      id: productId,
    },
  });
  if (!product) redirect("/products");
  return product;
};

export const createProductAction = async (
  prevState: any,
  formData: FormData
): Promise<{ message: string }> => {
  const user = await getAuthUser();

  try {
    const rawData = Object.fromEntries(formData);
    const file = formData.get("image") as File;
    const colors = formData
      .get("colors")
      ?.toString()
      .split(",")
      .map((c) => c.trim());
    const sizes = formData
      .get("sizes")
      ?.toString()
      .split(",")
      .map((c) => c.trim());
    const qtyString = formData.get("qty") as string;
    const categoryId = formData.get("categoryId") as string | null;
    const qty = parseInt(qtyString);
    const validateFields = validateWithZodSchema(productSchema, rawData);
    const validatedFile = validateWithZodSchema(imageSchema, { image: file });
    const fullPath = await uploadImage(validatedFile.image);

    await db.product.create({
      data: {
        ...validateFields,
        image: fullPath,
        clerkId: user.id,
        colors: JSON.stringify(colors),
        sizes: JSON.stringify(sizes),
        categoryId,
        qty,
      },
    });

    return { message: "product created" };
  } catch (error) {
    return renderError(error);
  }
};

export const fetchAdminProducts = async () => {
  await getAdminUser();
  const products = await db.product.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  return products;
};

export const deleteProductAction = async (prevState: { productId: string }) => {
  const { productId } = prevState;
  await getAdminUser();

  try {
    const product = await db.product.delete({
      where: {
        id: productId,
      },
    });
    await deleteImage(product.image);
    revalidatePath("/admin/products");
    return { message: "product removed" };
  } catch (error) {
    return renderError(error);
  }
};

export const updateProductAction = async (
  prevState: any,
  formData: FormData
) => {
  await getAdminUser();
  try {
    const productId = formData.get("id") as string;
    const rawData = Object.fromEntries(formData);

    const validatedFields = validateWithZodSchema(productSchema, rawData);
    const colors = formData
      .get("colors")
      ?.toString()
      .split(",")
      .map((c) => c.trim());
    const sizes = formData
      .get("sizes")
      ?.toString()
      .split(",")
      .map((c) => c.trim());
    const qtyString = formData.get("qty") as string;
    const qty = parseInt(qtyString);
    const categoryId = formData.get("categoryId") as string | null;
    await db.product.update({
      where: {
        id: productId,
      },
      data: {
        ...validatedFields,
        colors: JSON.stringify(colors),
        sizes: JSON.stringify(sizes),
        qty,
        categoryId,
      },
    });
    revalidatePath(`/admin/products/${productId}/edit`);
    return { message: "Product updated successfully" };
  } catch (error) {
    return renderError(error);
  }
};

export const fetchAdminProductDetails = async (productId: string) => {
  await getAdminUser();
  const product = await db.product.findUnique({
    where: {
      id: productId,
    },
  });

  if (!product) redirect("/admin/products");
  return product;
};

export const updateProductImageAction = async (
  prevState: any,
  formData: FormData
) => {
  await getAuthUser();
  try {
    const image = formData.get("image") as File;
    const productId = formData.get("id") as string;
    const oldImageUrl = formData.get("url") as string;
    const validatedFile = validateWithZodSchema(imageSchema, { image });
    const fullPath = await uploadImage(validatedFile.image);
    await deleteImage(oldImageUrl);
    await db.product.update({
      where: {
        id: productId,
      },
      data: {
        image: fullPath,
      },
    });
    revalidatePath(`/admin/products/${productId}/edit`);
    return { message: "Product Image updated successfully" };
  } catch (error) {
    return renderError(error);
  }
};

export const fetchFavoriteId = async ({ productId }: { productId: string }) => {
  const user = await getAuthUser();
  const favorite = await db.favorite.findFirst({
    where: {
      productId,
      clerkId: user.id,
    },
    select: {
      id: true,
    },
  });

  return favorite?.id || null;
};

export const toggleFavoriteAction = async (prevState: {
  productId: string;
  favoriteId: string | null;
  pathname: string;
}) => {
  const user = await getAuthUser();
  const { productId, favoriteId, pathname } = prevState;

  try {
    if (favoriteId) {
      await db.favorite.delete({
        where: {
          id: favoriteId,
        },
      });
    } else {
      await db.favorite.create({
        data: {
          productId,
          clerkId: user.id,
        },
      });
    }
    revalidatePath(pathname);
    return { message: favoriteId ? "removed from faves" : "added to faves" };
  } catch (error) {
    return renderError(error);
  }
};

export const fetchUserFavorites = async () => {
  const user = await getAuthUser();

  const favorites = await db.favorite.findMany({
    where: {
      clerkId: user.id,
    },
    include: {
      product: true,
    },
  });
  return favorites;
};

export const createReviewAction = async (
  prevState: any,
  formData: FormData
) => {
  const user = await getAuthUser();
  try {
    const rawData = Object.fromEntries(formData);
    const validatedFields = validateWithZodSchema(reviewSchema, rawData);
    await db.review.create({
      data: {
        ...validatedFields,
        clerkId: user.id,
      },
    });
    revalidatePath(`/products/${validatedFields.productId}`);
    return { message: "review submitted successfully" };
  } catch (error) {
    return renderError(error);
  }
};

export const fetchProductReviews = async (productId: string) => {
  const reviews = await db.review.findMany({
    where: {
      productId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  return reviews;
};
export const fetchProductReviewsByUser = async () => {
  const user = await getAuthUser();
  const reviews = await db.review.findMany({
    where: {
      clerkId: user.id,
    },
    select: {
      id: true,
      rating: true,
      comment: true,
      product: {
        select: {
          image: true,
          name: true,
        },
      },
    },
  });
  return reviews;
};
export const deleteReviewAction = async (prevState: { reviewId: string }) => {
  const { reviewId } = prevState;
  const user = await getAuthUser();
  try {
    await db.review.delete({
      where: {
        id: reviewId,
        clerkId: user.id,
      },
    });
    revalidatePath("/reviews");
    return { message: "review deleted successfully" };
  } catch (error) {
    return renderError(error);
  }
};

export const findExistingReview = async (userId: string, productId: string) => {
  return db.review.findFirst({
    where: {
      clerkId: userId,
      productId,
    },
  });
};

export const fetchProductRating = async (productId: string) => {
  const result = await db.review.groupBy({
    by: ["productId"],
    _avg: {
      rating: true,
    },
    _count: {
      rating: true,
    },
    where: { productId },
  });
  return {
    rating: result[0]?._avg.rating?.toFixed(1) ?? 0,
    count: result[0]?._count.rating ?? 0,
  };
};

export const fetchCartItems = async () => {
  const { userId } = auth();
  const cart = await db.cart.findFirst({
    where: {
      clerkId: userId ?? "",
    },
    select: {
      numItemsInCart: true,
    },
  });
  return cart?.numItemsInCart || 0;
};

const fetchProduct = async (productId: string) => {
  const product = await db.product.findUnique({
    where: {
      id: productId,
    },
  });
  if (!product) {
    throw new Error("Product not found");
  }
  return product;
};

const includeProductClause = {
  cartItems: {
    include: {
      product: true,
    },
  },
};

export const fetchOrCreateCart = async ({
  userId,
  errorOnFailure = false,
}: {
  userId: string;
  errorOnFailure?: boolean;
}) => {
  let cart = await db.cart.findFirst({
    where: {
      clerkId: userId,
    },
    include: includeProductClause,
  });
  if (!cart && errorOnFailure) {
    throw new Error("cart not found");
  }
  if (!cart) {
    cart = await db.cart.create({
      data: {
        clerkId: userId,
      },
      include: includeProductClause,
    });
  }
  return cart;
};

const updateOrCreateCartItem = async ({
  productId,
  cartId,
  amount,
  color,
  size,
}: {
  productId: string;
  cartId: string;
  amount: number;
  color: string;
  size: string;
}) => {
  let cartItem = await db.cartItem.findFirst({
    where: {
      productId,
      cartId,
    },
  });
  if (cartItem) {
    cartItem = await db.cartItem.update({
      where: {
        id: cartItem.id,
      },
      data: {
        amount: cartItem.amount + amount,
        color,
        size,
      },
    });
  } else {
    cartItem = await db.cartItem.create({
      data: { amount, productId, cartId, color, size },
    });
  }
};

export const updateCart = async (cart: Cart) => {
  const cartItems = await db.cartItem.findMany({
    where: {
      cartId: cart.id,
    },
    include: {
      product: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
  let numItemsInCart = 0;
  let cartTotal = 0;

  for (const item of cartItems) {
    numItemsInCart += item.amount;
    cartTotal += item.amount * item.product.price;
  }
  // const tax =  cart.taxRate * cartTotal
  // const shipping = cartTotal ? cart.shipping : 0;
  const tax = 0 * cartTotal;
  const shipping = cartTotal * 0;
  const orderTotal = cartTotal + tax + shipping;

  const currentCart = await db.cart.update({
    where: {
      id: cart.id,
    },
    data: {
      numItemsInCart,
      cartTotal,
      tax,
      orderTotal,
    },
    include: includeProductClause,
  });

  return { cartItems, currentCart };
};

export const addToCartAction = async (prevState: any, formData: FormData) => {
  const user = await getAuthUser();
  try {
    const productId = formData.get("productId") as string;
    const color = formData.get("color") as string;
    const size = formData.get("size") as string;
    const amount = Number(formData.get("amount"));
    await fetchProduct(productId);
    const cart = await fetchOrCreateCart({ userId: user.id });
    await updateOrCreateCartItem({
      productId,
      cartId: cart.id,
      amount,
      color,
      size,
    });
    await updateCart(cart);
  } catch (error) {
    return renderError(error);
  }

  redirect("/cart");
};

export const removeCartItemAction = async (
  prevState: any,
  formData: FormData
) => {
  const user = await getAuthUser();
  try {
    const cartItemId = formData.get("id") as string;
    const cart = await fetchOrCreateCart({
      userId: user.id,
      errorOnFailure: true,
    });
    await db.cartItem.delete({
      where: {
        id: cartItemId,
        cartId: cart.id,
      },
    });
    await updateCart(cart);
    revalidatePath("/cart");
    return { message: "Item removed from cart" };
  } catch (error) {
    return renderError(error);
  }
};

export const updateCartItemAction = async ({
  amount,
  cartItemId,
  color,
  size,
}: {
  amount?: number;
  cartItemId: string;
  color?: string;
  size?: string;
}) => {
  const user = await getAuthUser();

  try {
    const cart = await fetchOrCreateCart({
      userId: user.id,
      errorOnFailure: true,
    });
    await db.cartItem.update({
      where: {
        id: cartItemId,
        cartId: cart.id,
      },
      data: {
        amount,
        color,
        size,
      },
    });
    await updateCart(cart);
    revalidatePath("/cart");
    return { message: "cart updated" };
  } catch (error) {
    return renderError(error);
  }
};

export const createOrderAction = async (prevState: any, formData: FormData) => {
  const user = await getAuthUser();
  let orderId: null | string = null;
  let cartId: null | string = null;
  try {
    const cart = await fetchOrCreateCart({
      userId: user.id,
      errorOnFailure: true,
    });
    cartId = cart.id;

    await db.order.deleteMany({
      where: {
        clerkId: user.id,
        isPaid: false,
      },
    });

    const order = await db.order.create({
      data: {
        clerkId: user.id,
        products: cart.numItemsInCart,
        orderTotal: cart.orderTotal,
        tax: cart.tax,
        shipping: cart.shipping,
        email: user.emailAddresses[0].emailAddress,
        OrderItems: {
          create: cart.cartItems.map((item: any) => ({
            productId: item.productId,
            quantity: item.amount,
            color: item.color,
            size: item.size,
          })),
        },
      },
    });

    orderId = order.id;
  } catch (error) {
    return renderError(error);
  }

  redirect(`/checkout?orderId=${orderId}&cartId=${cartId}`);
};

export const fetchUserOrders = async () => {
  const user = await getAuthUser();
  const orders = await db.order.findMany({
    where: {
      clerkId: user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  return orders;
};

export const fetchAdminOrders = async () => {
  await getAdminUser();
  const orders = await db.order.findMany({
    orderBy: {
      createdAt: "desc",
    },
    // include:{
    // 	OrderItems:{
    // 		include:{
    // 			product:true
    // 		}
    // 	}
    // }
  });
  return orders;
};

export const getOrderWithProducts = async (id: string) => {
  await getAuthUser();
  const order = await db.order.findUnique({
    where: { id },
    include: {
      OrderItems: {
        include: {
          product: true,
        },
      },
    },
  });
  return order;
};

export const createSliderAction = async (
  prevState: any,
  formData: FormData
): Promise<{ message: string }> => {
  await getAdminUser();
  try {
    const file = formData.get("image") as File;
    const title = formData.get("title") as string;
    const validatedFile = validateWithZodSchema(imageSchema, { image: file });
    const fullPath = await uploadImage(validatedFile.image);

    await db.slider.create({
      data: {
        title,
        imageUrl: fullPath,
      },
    });

    // return {message:'slider created'}
  } catch (error) {
    return renderError(error);
  }

  redirect("/admin/sliders");
};

export const fetchAdminSlider = async () => {
  await getAdminUser();
  const sliders = await db.slider.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });
  return sliders;
};

export const fetchSlider = async () => {
  const sliders = await db.slider.findMany({
    select: {
      id: true,
      imageUrl: true,
    },
  });
  return sliders;
};

export const deleteSliderAction = async (prevState: { sliderId: string }) => {
  const { sliderId } = prevState;
  await getAdminUser();

  try {
    const slider = await db.slider.delete({
      where: {
        id: sliderId,
      },
    });
    await deleteImage(slider.imageUrl);
    revalidatePath("/admin/sliders");
    return { message: "slider removed" };
  } catch (error) {
    return renderError(error);
  }
};

const SHIPPING_OPTIONS = {
  west: 3000,
  east: 6000,
  north: 7000,
  south: 5000,
};

export const updateOrderShipping = async (
  orderId: string,
  details: {
    firstName: string;
    lastName: string;
    phone: string;
    state: string;
    address: string;
    deliveryType: "ship" | "instore";
    shippingMethod: "west" | "east" | "north" | "south";
  }
) => {
  try {
    const shipping =
      details.deliveryType === "ship"
        ? SHIPPING_OPTIONS[details.shippingMethod]
        : 0;
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { orderTotal: true, tax: true },
    });

    if (!order) throw new Error("Order not found");
    const newOrderTotal = (order?.orderTotal ?? 0) + shipping;

    await db.order.update({
      where: { id: orderId },
      data: {
        shippingDetails: details,
        deliveryType: details.deliveryType,
        shippingMethod: details.shippingMethod,
        shipping: shipping,
      },
    });
    return { success: true };
  } catch (error) {
    console.error("[ORDER SHIPPING ERROR]", error);
    return { success: false, error: "Failed to update order." };
  }
};

export const createCategoryAction = async (
  prevState: any,
  formData: FormData
): Promise<{ message: string }> => {
  await getAdminUser();
  try {
    const name = formData.get("name") as string;

    await db.category.create({
      data: {
        name,
      },
    });
  } catch (error) {
    return renderError(error);
  }
  redirect("/admin/category");
};

export const fetchAdminCat = async () => {
  await getAdminUser();
  const category = await db.category.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });
  return category;
};

export const deleteCategoryAction = async (prevState: { catId: string }) => {
  const { catId } = prevState;
  await getAdminUser();

  try {
    const cat = await db.category.delete({
      where: {
        id: catId,
      },
    });

    revalidatePath("/admin/category");
    return { message: "category removed" };
  } catch (error) {
    return renderError(error);
  }
};

export const fetchAdminCategoryDetails = async (catId: string) => {
  await getAdminUser();
  const category = await db.category.findUnique({
    where: {
      id: catId,
    },
  });

  if (!category) redirect("/admin/category");
  return category;
};

export const updateCategoryAction = async (
  prevState: any,
  formData: FormData
) => {
  await getAdminUser();
  try {
    const catId = formData.get("id") as string;
    const name = formData.get("name") as string;

    await db.category.update({
      where: {
        id: catId,
      },
      data: {
        name,
      },
    });
    revalidatePath(`/admin/category/${catId}/edit`);
    return { message: "category updated successfully" };
  } catch (error) {
    return renderError(error);
  }
};

export const fetchCats = async () => {
  const category = await db.category.findMany({
    select: { id: true, name: true },
    orderBy: {
      createdAt: "desc",
    },
  });
  return category;
};

export const getProductsByCategory = async (id: string) => {
  const category = await db.category.findUnique({
    where: { id },
    include: {
      products: true, // Include related products
    },
  });

  if (!category) {
    throw new Error("Category not found");
  }

  return category;
};
