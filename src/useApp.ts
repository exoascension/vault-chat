import { AppContext} from "./appContext";
import * as React from "react";
import {App} from "obsidian";

export const useApp = (): App | undefined => {
	return React.useContext(AppContext);
};
