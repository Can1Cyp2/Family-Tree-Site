# Family Tree App

A React-based family tree application that allows you to create, manage, and visualize family relationships. Built with TypeScript, React, and Supabase for data storage.

## Features

- **Interactive Family Tree Visualization**: Beautiful, responsive family tree layout with zoom and pan capabilities
- **Add Family Members**: Easily add new family members with detailed information
- **Manage Relationships**: Create parent-child, spouse, and sibling relationships
- **Add Parents Without Disruption**: The app intelligently preserves the existing tree structure when adding parents to existing members
- **Mobile-Friendly**: Responsive design that works on both desktop and mobile devices
- **Real-time Updates**: Changes are immediately reflected in the tree visualization

## Adding Parents

The app features a smart tree layout algorithm that preserves the existing family structure when adding parents:

- **Preserves Main Family Line**: When adding parents to existing members, the app maintains the visual structure by prioritizing the family line with the most descendants
- **No Layout Disruption**: Adding parents won't shift or reorganize your existing family tree layout
- **Intuitive Positioning**: New parents are positioned above their children while maintaining the overall tree structure

### How to Add Parents

1. Click on any family member in the tree
2. Click the "+" button to add a related member
3. Select "Parent" as the relationship type
4. Fill in the new parent's information
5. The parent will be added above the selected member without disrupting the existing layout

## Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).
