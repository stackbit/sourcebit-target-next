# sourcebit-target-next

[![npm version](https://badge.fury.io/js/sourcebit-target-next.svg)](https://badge.fury.io/js/sourcebit-target-next)

A Sourcebit target plugin for the [Next.js](https://nextjs.org/) framework.

## Overview

This plugin leverages [Next.js SSG capabilities](https://nextjs.org/blog/next-9-3#next-gen-static-site-generation-ssg-support)
to provide content from any Sourcebit data source, such as Headless CMS, into
React page components as properties using [getStaticProps](https://nextjs.org/docs/basic-features/data-fetching#getstaticprops-static-generation)
and [getStaticPaths](https://nextjs.org/docs/basic-features/data-fetching#getstaticpaths-static-generation)
methods

## Installation

1. Install sourcebit and the plugin:

   ```
   npm install sourcebit sourcebit-target-next
   ``` 

2. Import sourcebit and `sourcebit.js` configuration file in your `next.config.js` file (the next section will
   explain how to configure `sourcebit.js` file):

   ```js
   const sourcebit = require('sourcebit');
   const sourcebitConfig = require('./sourcebit.js');
   sourcebit.fetch(sourcebitConfig);
   ```

3. Update `getStaticPaths` and `getStaticProps` of your page components in the
   following way to get static props from sourcebit plugin.

    - Import `sourcebitDataClient` from the plugin:
    
      ```js
      import { sourcebitDataClient } from 'sourcebit-target-next';
      ```
    
    - If a page does not use [dynamic routes](https://nextjs.org/docs/routing/dynamic-routes)
      then it should only have the `getStaticProps` method. Update it to fetch
      static props using the `sourcebitDataClient.getStaticPropsForPageAtPath(path)`,
      where `path` is the URL path of the rendered page.
      
      For example, if the page component is `index.js`, then the path should be 
      `/`, and if the page component is `about.js`, then the path should be `/about`.
      
      `pages/index.js`
      ```js
      import { sourcebitDataClient } from 'sourcebit-target-next';
      
      export async function getStaticProps() {
          const props = await sourcebitDataClient.getStaticPropsForPageAtPath('/');
          return { props };
      }
      ```
    
    - If a page does use [dynamic routes](https://nextjs.org/docs/routing/dynamic-routes)
      then it should have both `getStaticProps` and `getStaticPaths` methods.
      
      Similar to the previous example, use `getStaticPropsForPageAtPath(path)` 
      inside `getStaticProps` to fetch static props using `getStaticPropsForPageAtPath(path)`.
      The `path` should be created by applying `params` passed to the `getStaticProps`
      to the pattern of the dynamic route.
      
      `pages/[...slug].js`
      ```js
      import { sourcebitDataClient } from 'sourcebit-target-next';
      
      export async function getStaticProps({ params }) {
          const pagePath = '/' + params.slug.join('/');
          const props = await sourcebitDataClient.getStaticPropsForPageAtPath(pagePath);
          return { props };
      }
      ```
      
      Use `sourcebitDataClient.getStaticPaths()` to get the paths of all of the
      pages and return them from `getStaticPaths`. Note: `sourcebitDataClient.getStaticPaths()`
      returns all paths of all pages, therefore you will need to filter them only
      to these, that are supported by dynamic routes of the given page.
      
      For example, if you have two pages with dynamic routes, each will have to filter
      its own paths:
      
      `pages/post/[pid].js`
      ```js
      import { sourcebitDataClient } from 'sourcebit-target-next';
      
      export async function getStaticProps() {
          ...
      }
      
      export async function getStaticPaths() {
          const paths = await sourcebitDataClient.getStaticPaths();
          return {
              paths: paths.filter(path => path.startsWith('/post/')),
              fallback: false
          };
      }
      ```
      
      `pages/[...slug].js`
      ```js
      import { sourcebitDataClient } from 'sourcebit-target-next';
      
      export async function getStaticProps() {
          ...
      }
      
      export async function getStaticPaths() {
          const paths = await sourcebitDataClient.getStaticPaths();
          return {
              // do not include paths for /post/[pid].js and for /index.js
              paths: paths.filter(path => path !== '/' && !path.startsWith('/post/')),
              fallback: false
          };
      }
      ```

4. To update the browser with live content changes while running `next dev`, wrap
   your pages with following HOC:
   
   ```js
   import withRemoteDataUpdates from 'sourcebit-target-next/withRemoteDataUpdates';
   
   class Page extends React.Component {
       render() {
           // ...
       }
   }
   
   export default withRemoteDataUpdates(Page);
   ```

## Sourcebit Configuration

The plugin receives two options:

1. `pageTypes` (array) Array of objects mapping entries fetched by one of the
   source plugins to props that will be provided to a **specific page identified
   by its path** via `getStaticProps`.
   
   Every object should define two fields `path` and `predicate`. The `predicate`
   is used to filter entries fetched by source plugins. While the `path` is used
   to generate the URL path of the page. The `path` parameter can use tokens in
   form of `{token_name}` where each `token_name` is a field of an entry.
   
   Eventually, when calling `sourcebitDataClient.getStaticPropsForPageAtPath(pagePath)`
   from within `getStaticProps`, the returned value will be an object with two
   properties `page` holding the actual page entry and `path` matching the
   `pagePath` passed to `getStaticPropsForPageAtPath`.
   
   For example:
   
   ```js
   // lodash's matchesProperty(path, value) creates a function that compares
   // between the value at "path" of a given object to the provided "value"
   [
       { path: '/{slug}', predicate: _.matchesProperty('__metadata.modelName', 'page') },
       { path: '/{slug}', predicate: _.matchesProperty('__metadata.modelName', 'custom_page') },
       { path: '/blog/{slug}', predicate: _.matchesProperty('__metadata.modelName', 'post') }
   ]
   ```
   
   Assuming a Headless CMS returned a page of type `custom_page` having `slug: "about"`,
   calling `sourcebitDataClient.getStaticPropsForPageAtPath('/about')` from within
   `getStaticProps` will return a following object:
   
   ```js
   {
       path: '/about',
       page: {
           slug: "about",
           ...otherEntryFields    
       }
   }
   ```  
    
2. `propsMap` (object) Object mapping entries fetched by one of the source
   plugins to props that will be provided to **all page components** via
   `getStaticProps`.
   
   The keys of the object specify the propery names that will be provided to
   page components, and their values specify what data should go into these
   properties. Every value should be an object with `predicate` field.
   The `predicate` is used to filter entries fetched by source plugins.
   Additionally, a boolean field `single` can be used to specify that property
   should reference a single entry rather list of entries. If `single: true` and
   there are multiple entries, the first one will be selected. 
   
   Eventually, when calling `sourcebitDataClient.getStaticPropsForPageAtPath(pagePath)`
   from within `getStaticProps`, the returned value will be an object with two
   predefined properties `page` and `path` as described above, plus all the
   properties defined by this map.
   
   For example:
   
   ```js
   {
       config: { single: true, predicate: _.matchesProperty('_type', 'site_config') },
       posts: { predicate: _.matchesProperty('_type', 'post') }
   }
   ```
   
   When calling `sourcebitDataClient.getStaticPropsForPageAtPath(pagePath)`, in
   addition to `page` and `path` properties, the returned object will have
   `config` and `posts`:
   
   ```js
   {
       path: '/about',
       page: { ... },
       config: { ... },
       posts: [ ... ]
   }
   ```  

You can check out an [example project](https://github.com/stackbithq/azimuth-nextjs-sanity)
that uses `sourcebit-source-sanity` and `sourcebit-target-next` plugins to fetch
the data from [Sanity.io](https://www.sanity.io/) Headless CMS and feed it into
Next.js page components.

## Tips

Add following to your `.gitignore`:

```
.sourcebit-cache.json
.sourcebit-nextjs-cache.json
```

To simplify the dynamic routing architecture and to allow greater flexibility
when creating pages in Headless CMS, we advise using following pattern:

`pages/[...slug].js`
```js
import React from 'react';
import { sourcebitDataClient } from 'sourcebit-target-next';
import withRemoteDataUpdates from 'sourcebit-target-next/withRemoteDataUpdates';
import pageLayouts from '../layouts';

class Page extends React.Component {
    render() {
        // every page can have different layout, pick the layout based
        // on the modelName of the page
        const PageLayout = pageLayouts[_.get(this.props, 'page.__metadata.modelName')];
        return <PageLayout {...this.props}/>;
    }
}

export async function getStaticPaths() {
    const paths = await sourcebitDataClient.getStaticPaths();
    return { paths: paths.filter(path => path !== '/'), fallback: false };
}

export async function getStaticProps({ params }) {
    const pagePath = '/' + params.slug.join('/');
    const props = await sourcebitDataClient.getStaticPropsForPageAtPath(pagePath);
    return { props };
}

export default withRemoteDataUpdates(Page);
```

`pages/index.js`
```js
import Page from './[...slug]';
import { sourcebitDataClient } from 'sourcebit-target-next';

export async function getStaticProps({ params }) {
    console.log('Page [index] getStaticProps, params: ', params);
    const props = await sourcebitDataClient.getStaticPropsForPageAtPath('/');
    return { props };
}

export default Page;
```

Note: we are using additional `index.js` page because `[...slug].js` page does
not catch root page `/`;
