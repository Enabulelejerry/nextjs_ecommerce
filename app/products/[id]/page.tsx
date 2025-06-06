import BreadCrumbs from '@/components/single-product/BreadCrumbs';
import { fetchSingleProduct,findExistingReview} from '@/utils/actions';
import Image from 'next/image';
import { formatCurrency } from '@/utils/format';
import FavoriteToggleButton from '@/components/products/FavoriteToggleButton';
import AddToCart from '@/components/single-product/AddToCart';
import ProductRating from '@/components/single-product/ProductRating';
import SharedButton from '@/components/single-product/SharedButton';

import React from 'react'
import ProductReviews from '@/components/reviews/ProductReviews';
import SubmitReview from '@/components/reviews/SubmitReview';
import {auth} from '@clerk/nextjs/server'


async function SingleProductPage({params}:{params:{id:string}}) {
	const  product =  await fetchSingleProduct(params.id)
	const {name,image,company,description,price,colors,sizes,qty} = product
	 const productQty = qty
	const colorArray: string[] = JSON.parse(colors || '[]');
    const sizeArray: string[] = JSON.parse(sizes || '[]');
	const colorString = colorArray.join(', ');
     const sizeString = sizeArray.join(', ');
	const dollarAmount =  formatCurrency(price)
	const {userId} = auth();
    const reviewDoesNotExist = userId && !(await findExistingReview(userId,params.id))
  return  <section>
		  <BreadCrumbs name={product.name} />
		  <div className='mt-6 grid gap-y-8 lg:grid-cols-2 lg:gap-x-16'>
			  {/* IMAGE FIRST COL */}
				<div className='relative w-full h-[300px] sm:h-[400px] md:h-[500px] lg:h-full'>
				  <Image src={image} alt={name} fill sizes='(max-width:768px) 100vw,(max-width:1200px) 50vw, 33vw' priority className='w-full rounded object-cover' />
				</div>
			  {/* PRODUCT INFO SECOND COL */}

			  <div>
				  <div className='flex gap-x-8 items-center'>
					 <h1 className='capitalize text-3xl font-bold'>{name}</h1>
					 <div className='flex items-center gap-x-2'>
					   <FavoriteToggleButton productId={params.id} />
					   <SharedButton name={product.name}productId={params.id} />
					 </div>
					 
				  </div>
				  <ProductRating productId={params.id} />
				  <h4 className='text-xl mt-2'>{company}</h4>
				  <p className='mt-3 text-md bg-muted inline-block p-2 rounded'>{dollarAmount}</p>
				  <p className='mt-6 leading-8 text-muted-foreground'>{description}</p>

				   {productQty && productQty > 0 ? (
                  <AddToCart 
				  productId={params.id}
				  colors={colorArray} 
                  sizes={sizeArray}
				  productQty={productQty}
				   />
					) : (
					<h3 className='text-destructive mt-3 bg-red-50 p-3' >Product out of stock</h3>
					)}
				  
			  </div>


		  </div>
		  <ProductReviews productId={params.id} />
		  {reviewDoesNotExist  && <SubmitReview productId={params.id} />}

  </section>
}

export default SingleProductPage