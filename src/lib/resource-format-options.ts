import { prisma } from "@/lib/prisma";
import { resourceFormatDefaults, resourceSubmenuDefaults } from "@/lib/resource-taxonomy";

export type ResourceSubmenuOption = {
  id?: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  resourceFormatId?: string;
  resourceFormatName?: string;
};

export type ResourceFormatOption = {
  id?: string;
  name: string;
  description?: string | null;
  iconPath?: string | null;
  sortOrder: number;
  isActive: boolean;
  submenus: ResourceSubmenuOption[];
};

export function fallbackResourceFormatOptions(includeInactive = false): ResourceFormatOption[] {
  const formats = resourceFormatDefaults.map((format) => ({
    ...format,
    isActive: true,
    submenus: resourceSubmenuDefaults
      .filter((submenu) => submenu.resourceFormat === format.name)
      .map((submenu) => ({
        name: submenu.name,
        description: submenu.description,
        sortOrder: submenu.sortOrder,
        isActive: true,
        resourceFormatName: format.name
      }))
  }));
  return includeInactive ? formats : formats.filter((format) => format.isActive);
}

export async function getResourceFormatOptions(includeInactive = false): Promise<ResourceFormatOption[]> {
  try {
    const rows = await prisma.resourceFormat.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: {
        submenus: {
          where: includeInactive ? undefined : { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
        }
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });

    if (rows.length > 0) {
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        iconPath: row.iconPath,
        sortOrder: row.sortOrder,
        isActive: row.isActive,
        submenus: row.submenus.map((submenu) => ({
          id: submenu.id,
          name: submenu.name,
          description: submenu.description,
          sortOrder: submenu.sortOrder,
          isActive: submenu.isActive,
          resourceFormatId: submenu.resourceFormatId,
          resourceFormatName: row.name
        }))
      }));
    }
  } catch (error) {
    console.warn("Could not load resource formats from the database.", error);
  }

  return fallbackResourceFormatOptions(includeInactive);
}

export async function getAllResourceSubmenuOptions(includeInactive = false) {
  const formats = await getResourceFormatOptions(includeInactive);
  return formats.flatMap((format) =>
    format.submenus.map((submenu) => ({
      ...submenu,
      resourceFormatId: submenu.resourceFormatId ?? format.id,
      resourceFormatName: submenu.resourceFormatName ?? format.name
    }))
  );
}
